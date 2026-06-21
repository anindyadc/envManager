import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/client'
import { KeyRound, CheckCircle, AlertCircle, Loader } from 'lucide-react'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Missing verification token'); return }
    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(err => {
        setStatus('error')
        setMessage(err.response?.data?.detail ?? 'Verification failed')
      })
  }, [token])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl mb-4">
            <KeyRound className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-white">ENV Manager</h1>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl text-center">
          {status === 'loading' && (
            <>
              <Loader className="mx-auto text-brand-500 mb-3 animate-spin" size={40} />
              <h2 className="text-xl font-semibold text-gray-900">Verifying your email…</h2>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle className="mx-auto text-green-500 mb-3" size={40} />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Email verified!</h2>
              <p className="text-gray-500 text-sm mb-6">Your account is now active.</p>
              <Link to="/login" className="btn-primary inline-flex justify-center px-6 py-2.5">
                Sign in
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertCircle className="mx-auto text-red-400 mb-3" size={40} />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Verification failed</h2>
              <p className="text-gray-500 text-sm mb-4">{message}</p>
              <Link to="/login" className="text-brand-600 font-medium hover:underline text-sm">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
