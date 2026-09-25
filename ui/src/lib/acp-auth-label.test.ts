import { describe, expect, test } from 'bun:test'
import { authMethodLabel } from './acp'

describe('auth method label', () => {
  test('terminal setup and agent sign-in use the name the agent sent', () => {
    expect(authMethodLabel({ id: 'cli', name: 'ChatGPT', type: 'terminal' })).toBe('Set up ChatGPT')
    expect(authMethodLabel({ id: 'oauth', name: 'Grok' })).toBe('Sign in with Grok')
  })
})
