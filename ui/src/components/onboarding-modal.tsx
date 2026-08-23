'use client'

import { useState } from 'react'
import { Sparkles, KeyRound, MessageSquareText, PartyPopper, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useAppStore } from '@/lib/store'
import { useLocale } from '@/lib/i18n'

/**
 * P11.2 — onboarding flow (first launch → add first key → first chat →
 * success moment). Gated by `onboardingDone`; the same surface doubles as
 * the P11.5.3 first-run welcome (Open folder / add model actions on step 1).
 * The dialog cannot be dismissed mid-flow — completing the last step marks
 * onboarding done (skip is allowed at each step, which also completes it).
 */
export function OnboardingModal() {
  const onboardingDone = useAppStore((s) => s.onboardingDone)
  const setOnboardingDone = useAppStore((s) => s.setOnboardingDone)
  const setCenterScreen = useAppStore((s) => s.setCenterScreen)
  const setComposerValue = useAppStore((s) => s.setComposerValue)
  const { t } = useLocale()
  const [step, setStep] = useState(0)

  if (onboardingDone) return null

  const finish = () => setOnboardingDone(true)

  const steps = [
    {
      icon: Sparkles,
      title: t('onboarding.welcome'),
      desc: t('onboarding.subtitle'),
      body: (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Open a folder', action: () => setCenterScreen('files') },
            { label: 'Open a document', action: () => setCenterScreen('files') },
            { label: 'Add a model', action: () => setCenterScreen('settings') },
            { label: 'Just chat', action: () => setComposerValue('') },
          ].map((c) => (
            <button
              key={c.label}
              onClick={() => {
                c.action()
                setCenterScreen('chat')
                setStep(3)
              }}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-left text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent"
            >
              {c.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      icon: KeyRound,
      title: t('onboarding.addKey'),
      desc: t('onboarding.addKeyDesc'),
      body: (
        <button
          onClick={() => {
            setCenterScreen('settings')
            setStep(2)
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-3 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex items-center justify-between">
            <span>
              <span className="block font-medium text-foreground">OpenAI · Anthropic · DeepSeek · NVIDIA</span>
              <span className="block text-muted-foreground">Keys live in the encrypted vault — never the sidecar.</span>
            </span>
            <ArrowRight className="h-4 w-4 text-primary" />
          </span>
        </button>
      ),
    },
    {
      icon: MessageSquareText,
      title: t('onboarding.startChat'),
      desc: 'Ask for anything — plans, research, file edits, automations.',
      body: (
        <button
          onClick={() => {
            setCenterScreen('chat')
            setComposerValue('What can you do?')
            setStep(3)
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-3 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <span className="flex items-center justify-between">
            <span>
              <span className="block font-medium text-foreground">Try a first prompt</span>
              <span className="block text-muted-foreground">“Draft a weekly status report”</span>
            </span>
            <ArrowRight className="h-4 w-4 text-primary" />
          </span>
        </button>
      ),
    },
    {
      icon: PartyPopper,
      title: t('onboarding.success'),
      desc: t('onboarding.successDesc'),
      body: null,
    },
  ]

  const s = steps[step]

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-sm gap-0 p-0" showCloseButton={false}>
        <div className="flex flex-col gap-3 p-6">
          <div className="flex items-center gap-2">
            {steps.map((st, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <s.icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold tracking-tight">{s.title}</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          </div>
          {s.body && <div className="mt-2">{s.body}</div>}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                  {t('common.back')}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < steps.length - 1 ? (
                <>
                  <Button variant="ghost" size="sm" onClick={finish}>
                    {t('common.skip')}
                  </Button>
                  <Button size="sm" onClick={() => setStep(step + 1)}>
                    {t('common.next')}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={finish}>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  {t('common.start')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
