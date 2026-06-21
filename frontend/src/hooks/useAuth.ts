import { useSyncExternalStore } from 'react'
import type { User } from '../types'

// Module-level singleton auth state — no external store library needed
let _listeners: Array<() => void> = []
let _state: { user: User | null; token: string | null } = {
  user: (() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  })(),
  token: localStorage.getItem('token'),
}

function notify() { _listeners.forEach(fn => fn()) }

export function getAuthState() { return _state }

export function setAuth(user: User, token: string) {
  _state = { user, token }
  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
  notify()
}

export function clearAuth() {
  _state = { user: null, token: null }
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  notify()
}

export function useAuth() {
  const state = useSyncExternalStore(
    (cb) => { _listeners.push(cb); return () => { _listeners = _listeners.filter(l => l !== cb) } },
    () => _state
  )
  return { ...state, setAuth, clearAuth, isAdmin: state.user?.role === 'admin', isEditor: state.user?.role !== 'viewer' }
}
