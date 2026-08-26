//! P36 (G7) — the Windows USN journal reader (the raw WinAPI path).
//!
//! Compiled only on `cfg(windows)`. This is the seam that was previously
//! documented-but-not-built: opening the volume handle with `CreateFileW`,
//! querying the journal with `FSCTL_QUERY_USN_JOURNAL`, reading deltas with
//! `FSCTL_READ_USN_JOURNAL`, and resolving parent FRNs to paths via
//! `FSCTL_ENUM_USN_DATA` (cached, incrementally updated).
//!
//! The byte-format parsing lives in the cross-platform `usn_reader` module
//! (unit-tested on every host); this module only marshals WinAPI calls and
//! feeds parsed records to the `UsnCursor` consumer.
//!
//! API notes (windows-sys 0.61.2 bindings, verified line-by-line):
//! - `DeviceIoControl` is in `Win32::System::IO`; the `FSCTL_*` constants +
//!   `*_DATA_V0` structs are in `Win32::System::Ioctl` (own feature gate).
//! - Struct fields are PascalCase (`StartUsn`, `ReasonMask`, …).
//! - `GENERIC_READ` and `ERROR_HANDLE_EOF` come from `Win32::Foundation`.

use std::collections::HashMap;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};

use windows_sys::Win32::Foundation::{
    CloseHandle, ERROR_HANDLE_EOF, GENERIC_READ, HANDLE, INVALID_HANDLE_VALUE,
};
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_BACKUP_SEMANTICS, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows_sys::Win32::System::IO::DeviceIoControl;
use windows_sys::Win32::System::Ioctl::{
    FSCTL_ENUM_USN_DATA, FSCTL_QUERY_USN_JOURNAL, FSCTL_READ_USN_JOURNAL, MFT_ENUM_DATA_V0,
    READ_USN_JOURNAL_DATA_V0, USN_JOURNAL_DATA_V0,
};

use crate::usn::UsnRecord;
use crate::usn_reader::{assemble_path, parse_record_stream, UsnRawRecord};

/// FSCTL_* response buffer size. 64 KiB is the standard journal read chunk;
/// the MFT enum pass uses the same buffer (records are ≤ ~1 KiB each).
const BUFFER_BYTES: u32 = 64 * 1024;

/// Open the volume (e.g. `C:\` or `\\.\C:`) with backup semantics so admin
/// rights are not required to read the journal.
fn open_volume(volume: &str) -> Result<HANDLE, String> {
    let wide: Vec<u16> = Path::new(volume).as_os_str().encode_wide().chain(Some(0)).collect();
    // SAFETY: CreateFileW with a NUL-terminated wide path; null security
    // attributes; no template file. FILE_FLAG_BACKUP_SEMANTICS lets us open
    // directories/volumes without admin rights.
    let h = unsafe {
        CreateFileW(
            wide.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            std::ptr::null_mut(),
        )
    };
    if h == INVALID_HANDLE_VALUE {
        Err(format!("CreateFileW({volume}) failed: {}", std::io::Error::last_os_error()))
    } else {
        Ok(h)
    }
}

/// `FSCTL_QUERY_USN_JOURNAL` → journal identity + next-USN.
fn query_journal(h: HANDLE) -> Result<USN_JOURNAL_DATA_V0, String> {
    let mut data = USN_JOURNAL_DATA_V0::default();
    let mut bytes = 0u32;
    // SAFETY: output buffer is a valid USN_JOURNAL_DATA_V0; size matches.
    let ok = unsafe {
        DeviceIoControl(
            h,
            FSCTL_QUERY_USN_JOURNAL,
            std::ptr::null(),
            0,
            &mut data as *mut _ as *mut _,
            std::mem::size_of::<USN_JOURNAL_DATA_V0>() as u32,
            &mut bytes,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        Err(format!("FSCTL_QUERY_USN_JOURNAL failed: {}", std::io::Error::last_os_error()))
    } else {
        Ok(data)
    }
}

/// `FSCTL_READ_USN_JOURNAL` — one deltas chunk starting at `usn`.
///
/// Returns `(records, next_usn)` where `next_usn` (the response header's
/// cursor field) is authoritative for the next call.
fn read_journal_chunk(
    h: HANDLE,
    journal_id: u64,
    usn: u64,
    buffer: &mut Vec<u8>,
) -> Result<(Vec<UsnRawRecord>, u64), String> {
    let mut input = READ_USN_JOURNAL_DATA_V0 {
        StartUsn: usn as i64,
        ReasonMask: u32::MAX, // read all reasons; the parse layer filters
        ReturnOnlyOnClose: 0, // surface records on every close, not only final
        Timeout: 0,
        BytesToWaitFor: 0,
        UsnJournalID: journal_id,
    };
    let mut bytes = 0u32;
    // SAFETY: input is a valid READ_USN_JOURNAL_DATA_V0; output buffer is
    // BUFFER_BYTES of writable memory.
    let ok = unsafe {
        DeviceIoControl(
            h,
            FSCTL_READ_USN_JOURNAL,
            &mut input as *mut _ as *mut _,
            std::mem::size_of::<READ_USN_JOURNAL_DATA_V0>() as u32,
            buffer.as_mut_ptr() as *mut _,
            BUFFER_BYTES,
            &mut bytes,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(format!("FSCTL_READ_USN_JOURNAL failed: {}", std::io::Error::last_os_error()));
    }
    let (records, next_usn) = parse_record_stream(&buffer[..bytes as usize]);
    Ok((records, next_usn))
}

/// Parse the `FSCTL_ENUM_USN_DATA` output buffer: an `MFT_ENUM_DATA_V0`
/// header (16 bytes) followed by `USN_RECORD_V2` records. Returns the
/// records + the last FRN (the continuation point), or `(empty, start)`.
fn parse_enum_buffer(buf: &[u8]) -> (Vec<UsnRawRecord>, u64) {
    let (records, _) = parse_record_stream(buf);
    let last = records.last().map(|r| r.file_ref).unwrap_or(0);
    (records, last)
}

/// FRN → (name, parent FRN) index + assembled-path cache.
#[derive(Debug, Default)]
struct FrnIndex {
    entry_by_frn: HashMap<u64, (String, u64)>,
    path_cache: HashMap<u64, PathBuf>,
    volume: String,
}

impl FrnIndex {
    fn new(volume: &str) -> Self {
        Self { volume: volume.trim_end_matches('\\').to_string(), ..Default::default() }
    }

    /// Walk the MFT once (or from `start_frn`) to fill entries.
    fn enumerate(&mut self, h: HANDLE, mut start: u64) -> Result<(), String> {
        let mut buffer = vec![0u8; BUFFER_BYTES as usize];
        loop {
            let mut input = MFT_ENUM_DATA_V0 {
                StartFileReferenceNumber: start,
                LowUsn: 0,
                HighUsn: i64::MAX,
            };
            let mut bytes = 0u32;
            // SAFETY: input/output follow the FSCTL_ENUM_USN_DATA contract.
            let ok = unsafe {
                DeviceIoControl(
                    h,
                    FSCTL_ENUM_USN_DATA,
                    &mut input as *const _ as *const _,
                    std::mem::size_of::<MFT_ENUM_DATA_V0>() as u32,
                    buffer.as_mut_ptr() as *mut _,
                    BUFFER_BYTES,
                    &mut bytes,
                    std::ptr::null_mut(),
                )
            };
            if ok == 0 {
                let err = std::io::Error::last_os_error();
                if err.raw_os_error() == Some(ERROR_HANDLE_EOF as i32) {
                    return Ok(()); // normal end of enumeration
                }
                return Err(format!("FSCTL_ENUM_USN_DATA failed: {err}"));
            }
            let (records, next_frn) = parse_enum_buffer(&buffer[..bytes as usize]);
            if records.is_empty() || next_frn == start || next_frn == 0 {
                return Ok(()); // no progress → done
            }
            for rec in &records {
                self.entry_by_frn.insert(rec.file_ref, (rec.name.clone(), rec.parent_ref));
            }
            start = next_frn;
        }
    }

    /// Resolve the full path of `file_ref` (walking parents). `None` when the
    /// chain is unknown — caller falls back to the raw name (honest).
    fn path_of(&mut self, file_ref: u64, name: &str) -> Option<PathBuf> {
        if let Some(p) = self.path_cache.get(&file_ref) {
            return Some(p.clone());
        }
        let mut chain_rev = vec![name];
        let mut frn = file_ref;
        let mut guard = 0;
        // Walk up: child → parent. Root FRN is 0.
        while frn != 0 {
            let (n, parent) = self.entry_by_frn.get(&frn)?;
            chain_rev.push(n.as_str());
            frn = *parent;
            guard += 1;
            if guard > 64 {
                return None; // cycle/runaway — never loop forever
            }
        }
        chain_rev.reverse();
        let p = assemble_path(&self.volume, &chain_rev);
        self.path_cache.insert(file_ref, p.clone());
        Some(p)
    }

    /// Learn FRNs from a read batch; the first read primes the whole MFT.
    fn learn(&mut self, h: HANDLE, records: &[UsnRawRecord]) -> Result<(), String> {
        if self.entry_by_frn.is_empty() {
            self.enumerate(h, 0)?;
        }
        for rec in records {
            self.entry_by_frn.insert(rec.file_ref, (rec.name.clone(), rec.parent_ref));
        }
        Ok(())
    }
}

/// A live Windows USN journal reader bound to one volume.
///
/// ```no_run
/// let mut reader = NtfsJournalReader::open("C:\\")?;
/// let (records, next) = reader.read_since(0)?;
/// ```
pub struct NtfsJournalReader {
    handle: HANDLE,
    journal_id: u64,
    frn: FrnIndex,
    buffer: Vec<u8>,
}

impl NtfsJournalReader {
    /// Open the volume and query the journal identity. May fail when the
    /// volume has no journal yet (NTFS supports creating one via
    /// `FSCTL_CREATE_USN_JOURNAL` — out of scope here; the debounced-watch
    /// fallback covers that case).
    pub fn open(volume: &str) -> Result<Self, String> {
        let handle = open_volume(volume)?;
        match query_journal(handle) {
            Ok(info) => Ok(Self {
                handle,
                journal_id: info.UsnJournalID,
                frn: FrnIndex::new(volume),
                buffer: vec![0u8; BUFFER_BYTES as usize],
            }),
            Err(e) => {
                // SAFETY: the handle is valid (we just opened it).
                unsafe { CloseHandle(handle) };
                Err(e)
            }
        }
    }

    /// The journal id this reader is bound to (diagnostics).
    pub fn journal_id(&self) -> u64 {
        self.journal_id
    }

    /// Read all delta records with `usn > last_usn`; returns
    /// `(records, next_usn)` — pass `next_usn` back on the next call.
    pub fn read_since(&mut self, last_usn: u64) -> Result<(Vec<UsnRecord>, u64), String> {
        let (raws, next_usn) =
            read_journal_chunk(self.handle, self.journal_id, last_usn, &mut self.buffer)?;
        if raws.is_empty() {
            return Ok((Vec::new(), next_usn));
        }
        self.frn.learn(self.handle, &raws)?;
        let mut out = Vec::with_capacity(raws.len());
        for raw in raws {
            let path = self.frn.path_of(raw.file_ref, &raw.name).unwrap_or_else(|| {
                // Unresolvable parent chain — raw name at the volume root.
                PathBuf::from(format!("{}\\{}", self.frn.volume, raw.name))
            });
            out.push(UsnRecord { usn: raw.usn, reason: raw.reason, path });
        }
        Ok((out, next_usn))
    }
}

impl Drop for NtfsJournalReader {
    fn drop(&mut self) {
        // SAFETY: the handle is valid for the lifetime of this reader.
        unsafe { CloseHandle(self.handle) };
    }
}