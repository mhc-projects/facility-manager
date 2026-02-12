'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { Building2, Mail, Lock, Eye, EyeOff } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading, emailLogin } = useAuth()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)

  // 이미 로그인된 사용자는 리다이렉트
  useEffect(() => {
    if (user && !authLoading) {
      const redirectTo = searchParams?.get('redirect') || '/'
      console.log('✅ 이미 로그인됨, 리다이렉트:', redirectTo)

      // ✅ 간단한 리다이렉트 (쿠키 폴링 제거)
      const timeoutId = setTimeout(() => {
        window.location.replace(redirectTo)
      }, 500)

      // ✅ 클린업 함수: 컴포넌트 언마운트 시 타이머 정리
      return () => clearTimeout(timeoutId)
    }
  }, [user, authLoading, searchParams])

  // URL 파라미터에서 오류 메시지 확인
  useEffect(() => {
    const errorParam = searchParams?.get('error')

    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
  }, [searchParams])

  // 입력 필드 변경 핸들러
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  // 일반 로그인 핸들러
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify(formData),
        credentials: 'same-origin',
        mode: 'cors',
      })

      const result = await response.json()

      if (result.success) {
        // AuthContext의 emailLogin 함수 호출
        const authResult = await emailLogin(result.data.token, result.data)

        if (authResult.success) {
          setSuccessMessage('로그인되었습니다!')

          // ✅ 간단한 리다이렉트 (중복 폴링 제거)
          const redirectTo = searchParams?.get('redirect') || '/'
          console.log('✅ 로그인 성공, 리다이렉트:', redirectTo)

          setTimeout(() => {
            window.location.replace(redirectTo)
          }, 500)
        } else {
          setError(authResult.error || '인증 처리 중 오류가 발생했습니다.')
        }
      } else {
        // 상세한 에러 메시지 처리
        let errorMessage = '로그인에 실패했습니다.';
        if (result.error?.code === 'ACCOUNT_PENDING') {
          errorMessage = '계정 승인 대기 중입니다. 관리자에게 문의하세요.';
        } else if (result.error?.code === 'USER_NOT_FOUND') {
          errorMessage = '존재하지 않는 사용자입니다.';
        } else if (result.error?.code === 'INVALID_PASSWORD') {
          errorMessage = '비밀번호가 틀렸습니다.';
        } else {
          errorMessage = result.error?.message || '로그인에 실패했습니다.';
        }
        setError(errorMessage);
      }
    } catch (error) {
      console.error('로그인 오류:', error)

      // 네트워크 오류 상세 처리
      if (error instanceof TypeError && error.message.includes('fetch')) {
        if (error.message.includes('ERR_CONNECTION_CLOSED') || error.message.includes('Failed to fetch')) {
          setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setError('네트워크 연결을 확인해주세요.')
        }
      } else {
        setError('로그인 처리 중 오류가 발생했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center p-2 sm:p-4">
      <div className="w-full max-w-xs sm:max-w-md">
        {/* 로고 및 헤더 */}
        <div className="text-center mb-4 sm:mb-6 md:mb-8">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3 md:mb-4 shadow-lg">
            <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
          </div>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">시설관리 시스템</h1>
          <p className="text-xs sm:text-sm md:text-base text-gray-600 mt-1 sm:mt-2">주식회사 블루온</p>
          <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 mt-1">관리자 인증이 필요합니다</p>
        </div>

        {/* 로그인 폼 */}
        <div className="bg-white rounded-lg sm:rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6 md:p-8">
          <div className="mb-3 sm:mb-4 md:mb-6">
            <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-900 mb-1 sm:mb-2">로그인</h2>
            <p className="text-xs sm:text-sm md:text-base text-gray-600">
              계정 정보를 입력해주세요
            </p>
          </div>

          {error && (
            <div className="mb-2 sm:mb-3 md:mb-4 p-2 sm:p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs sm:text-sm md:text-base text-red-600">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                <p className="text-sm text-green-600">{successMessage}</p>
              </div>
            </div>
          )}

          {/* 이메일 로그인 폼 */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="inline w-4 h-4 mr-1" />
                  이메일
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="이메일을 입력하세요"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  <Lock className="inline w-4 h-4 mr-1" />
                  비밀번호
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-3 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="비밀번호를 입력하세요"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>로그인 중...</span>
                  </>
                ) : (
                  <span className="font-medium">로그인</span>
                )}
              </button>
            </form>

          <div className="mt-8 text-center space-y-4">
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/signup"
                className="text-sm text-blue-600 hover:text-blue-500 font-medium"
              >
                회원가입
              </Link>
              <span className="text-gray-300">|</span>
              <Link
                href="/forgot-password"
                className="text-sm text-gray-500 hover:text-gray-400"
              >
                비밀번호 찾기
              </Link>
            </div>
            <p className="text-xs text-gray-500">
              이메일 가입 후 관리자 승인이 필요합니다.
            </p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="text-center mt-8">
          <p className="text-xs text-gray-500">
            © 2025 주식회사 블루온. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}