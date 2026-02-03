/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],

  // ✅ 게이트웨이 색상 클래스를 safelist에 추가 (동적 클래스 생성을 위해)
  // Tailwind JIT가 런타임 동적 클래스를 감지하지 못하므로 명시적으로 포함
  safelist: [
    // air-permit-detail 페이지용: -200/-800 (진한 파스텔, 어두운 텍스트)
    'bg-blue-200', 'text-blue-800',
    'bg-green-200', 'text-green-800',
    'bg-yellow-200', 'text-yellow-800',
    'bg-red-200', 'text-red-800',
    'bg-purple-200', 'text-purple-800',
    'bg-pink-200', 'text-pink-800',
    'bg-indigo-200', 'text-indigo-800',
    'bg-cyan-200', 'text-cyan-800',
    'bg-orange-200', 'text-orange-800',
    'bg-teal-200', 'text-teal-800',
    'bg-lime-200', 'text-lime-800',
    'bg-rose-200', 'text-rose-800',
    'bg-gray-200', 'text-gray-800',

    // air-permit 페이지용: -100/-700/-300 (연한 파스텔, 밝은 텍스트, 테두리)
    'bg-blue-100', 'text-blue-700', 'border-blue-300',
    'bg-green-100', 'text-green-700', 'border-green-300',
    'bg-yellow-100', 'text-yellow-700', 'border-yellow-300',
    'bg-red-100', 'text-red-700', 'border-red-300',
    'bg-purple-100', 'text-purple-700', 'border-purple-300',
    'bg-pink-100', 'text-pink-700', 'border-pink-300',
    'bg-indigo-100', 'text-indigo-700', 'border-indigo-300',
    'bg-cyan-100', 'text-cyan-700', 'border-cyan-300',
    'bg-orange-100', 'text-orange-700', 'border-orange-300',
    'bg-teal-100', 'text-teal-700', 'border-teal-300',
    'bg-lime-100', 'text-lime-700', 'border-lime-300',
    'bg-rose-100', 'text-rose-700', 'border-rose-300',
    'bg-gray-100', 'text-gray-700', 'border-gray-300',
  ],

  theme: {
    extend: {
      // 폰트 최적화
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      
      // 기본 컬러 팔레트
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe', 
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        }
      },
      
      // 기본 애니메이션
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slideInRight': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        'slide-down': 'slide-down 0.4s ease-out',
        'slideInRight': 'slideInRight 0.3s ease-out',
      },
    },
  },
  
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          /* IE and Edge */
          '-ms-overflow-style': 'none',
          /* Firefox */
          'scrollbar-width': 'none',
          /* Safari and Chrome */
          '&::-webkit-scrollbar': {
            display: 'none'
          }
        }
      })
    }
  ],
}
