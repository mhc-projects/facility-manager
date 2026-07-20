'use client'

// E-PTO 순환자원정보센터 전자입찰 공고 조회 페이지
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import AdminLayout from '@/components/ui/AdminLayout'
import { useAuth } from '@/contexts/AuthContext'
import type { BidPbancItem, BidResultItem, EptoListResponse, BidStatusType, BidResultType } from '@/types/e-pto'
import {
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Clock,
  Recycle,
  AlertCircle,
  Phone,
  MapPin,
  Package,
  Calendar,
  User,
  ChevronDown,
} from 'lucide-react'

const PAGE_SIZE = 20
const AUTO_REFRESH_MS = 5 * 60 * 1000
// 포함 키워드 필터가 켜졌을 때 전체 검색 결과를 한 번에 가져오기 위한 상한
const FULL_FETCH_CAP = 1000

// 날짜 포맷: "202012140000" → "2020.12.14 00:00"
function fmtDt(s: string): string {
  if (!s || s.length < 8) return s || '-'
  const y = s.slice(0, 4), mo = s.slice(4, 6), d = s.slice(6, 8)
  if (s.length >= 12) {
    const h = s.slice(8, 10), m = s.slice(10, 12)
    return `${y}.${mo}.${d} ${h}:${m}`
  }
  return `${y}.${mo}.${d}`
}

// D-day 계산
function getDDay(dateStr: string): { label: string; color: string } {
  if (!dateStr || dateStr.length < 8) return { label: '-', color: 'text-gray-400' }
  const y = parseInt(dateStr.slice(0, 4))
  const mo = parseInt(dateStr.slice(4, 6)) - 1
  const d = parseInt(dateStr.slice(6, 8))
  const h = dateStr.length >= 10 ? parseInt(dateStr.slice(8, 10)) : 0
  const mi = dateStr.length >= 12 ? parseInt(dateStr.slice(10, 12)) : 0
  const deadline = new Date(y, mo, d, h, mi)
  const diff = Math.ceil((deadline.getTime() - Date.now()) / 86400000)
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, color: 'text-gray-400' }
  if (diff === 0) return { label: 'D-Day', color: 'text-red-600 font-bold' }
  if (diff <= 3) return { label: `D-${diff}`, color: 'text-red-500 font-semibold' }
  if (diff <= 7) return { label: `D-${diff}`, color: 'text-orange-500 font-semibold' }
  return { label: `D-${diff}`, color: 'text-blue-500' }
}

const STATUS_STYLE: Record<string, string> = {
  '입찰중':    'bg-green-50 text-green-700 border border-green-200',
  '재입찰중':  'bg-blue-50 text-blue-700 border border-blue-200',
  '입찰마감':  'bg-gray-100 text-gray-500 border border-gray-200',
  '개찰진행중': 'bg-amber-50 text-amber-700 border border-amber-200',
  '개찰완료':  'bg-purple-50 text-purple-700 border border-purple-200',
  '공고취소':  'bg-red-50 text-red-600 border border-red-200',
  '공고제출완료': 'bg-indigo-50 text-indigo-700 border border-indigo-200',
}

const RESULT_STYLE: Record<string, string> = {
  '낙찰':        'bg-green-50 text-green-700 border border-green-200',
  '부분낙찰':    'bg-blue-50 text-blue-700 border border-blue-200',
  '유찰':        'bg-orange-50 text-orange-600 border border-orange-200',
  '유찰(공고취소)': 'bg-red-50 text-red-600 border border-red-200',
}

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] || 'bg-gray-100 text-gray-500 border border-gray-200'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${cls}`}>{status || '-'}</span>
}

function ResultBadge({ result }: { result: string }) {
  const cls = RESULT_STYLE[result] || 'bg-gray-100 text-gray-500 border border-gray-200'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${cls}`}>{result || '-'}</span>
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <div className="mt-0.5 flex-shrink-0 text-gray-400">{icon}</div>}
      <div>
        <p className="text-gray-400 text-[10px] uppercase tracking-wide">{label}</p>
        <p className="text-gray-900 text-sm font-medium mt-0.5">{value || '-'}</p>
      </div>
    </div>
  )
}

// 입찰공고 상세 모달
function BidDetailModal({ item, onClose }: { item: BidPbancItem; onClose: () => void }) {
  const dday = getDDay(item.bidDdlnDt)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 — 고정 */}
        <div className="flex-shrink-0 border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <StatusBadge status={item.pbancSttsNm} />
              <span className="text-[11px] text-gray-400 font-mono">{item.pbancNo}</span>
            </div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{item.pbancNm}</h2>
          </div>
          <button onClick={onClose} className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* 바디 — 스크롤 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* 기관 */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">기관 정보</p>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={<User className="w-3.5 h-3.5" />} label="공고자" value={item.pbancIsrNm} />
              <InfoRow icon={<User className="w-3.5 h-3.5" />} label="담당자" value={item.picNm} />
              <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="전화번호" value={item.picTelno} />
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* 물품 */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">물품 정보</p>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={<Package className="w-3.5 h-3.5" />} label="대분류" value={item.cmdtyLclsfNm} />
              <InfoRow icon={<Package className="w-3.5 h-3.5" />} label="중분류" value={item.cmdtyMclsfNm} />
              <InfoRow icon={<Package className="w-3.5 h-3.5" />} label="소분류" value={item.cmdtySclsfNm} />
              <InfoRow icon={<Recycle className="w-3.5 h-3.5" />} label="입찰물품" value={item.bidCmdtyCn} />
              <InfoRow label="물품수량" value={item.pbancCmdtyQtyCn} />
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* 일정 */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">입찰 일정</p>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="입찰시작" value={fmtDt(item.bidBgngDt)} />
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex-shrink-0 text-gray-400"><Calendar className="w-3.5 h-3.5" /></div>
                <div>
                  <p className="text-gray-400 text-[10px] uppercase tracking-wide">입찰마감</p>
                  <p className="text-gray-900 text-sm font-medium mt-0.5">{fmtDt(item.bidDdlnDt)}</p>
                  <p className={`text-xs mt-0.5 ${dday.color}`}>{dday.label}</p>
                </div>
              </div>
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="개찰일자" value={fmtDt(item.bdopnYmd)} />
              <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="개찰장소" value={item.bdopnPlcNm} />
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* 조건 */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">입찰 조건</p>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="입찰구분" value={item.bidSeNm} />
              <InfoRow label="입찰방법" value={item.bidMthdNm} />
              <InfoRow label="참가방법" value={item.partcptMthdNm} />
              <InfoRow label="가격구분" value={item.prcSeNm} />
              <InfoRow label="예정가격" value={item.prnmntPrcCn} />
              <InfoRow label="입찰예정가격" value={item.bidCmdtyPrnmntPrcCn} />
              <InfoRow label="유효입찰성원" value={item.vldBidCrtrPeplCn} />
              <InfoRow label="자격제한" value={item.qlfcLmtMttr} />
              <InfoRow label="설명회개최" value={item.bidBrfnHdmtYnNm} />
            </div>
          </div>

          {(item.bidGtnExpln || item.gtnPayMthdExpln) && (
            <>
              <div className="border-t border-gray-100" />
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">보증금</p>
                <div className="grid grid-cols-1 gap-4">
                  {item.bidGtnExpln && <InfoRow label="입찰보증금" value={item.bidGtnExpln} />}
                  {item.gtnPayMthdExpln && <InfoRow label="납부방법" value={item.gtnPayMthdExpln} />}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 푸터 — 고정 */}
        {item.dtlInfoUrlAddr && (
          <div className="flex-shrink-0 border-t border-gray-100 px-6 py-4">
            <a
              href={item.dtlInfoUrlAddr}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              순환자원정보센터에서 원문 보기
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// 입찰결과 상세 모달
function ResultDetailModal({ item, onClose }: { item: BidResultItem; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 — 고정 */}
        <div className="flex-shrink-0 border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <ResultBadge result={item.pbancRsltNm} />
              <span className="text-[11px] text-gray-400 font-mono">{item.pbancNo}</span>
            </div>
            <h2 className="text-base font-bold text-gray-900 leading-snug">{item.pbancNm}</h2>
          </div>
          <button onClick={onClose} className="flex-shrink-0 p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* 바디 — 스크롤 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">기관 정보</p>
            <InfoRow icon={<User className="w-3.5 h-3.5" />} label="공고자" value={item.pbancIsrNm} />
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">물품 정보</p>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="대분류" value={item.cmdtyLclsfNm} />
              <InfoRow label="중분류" value={item.cmdtyMclsfNm} />
              <InfoRow label="소분류" value={item.cmdtySclsfNm} />
              <InfoRow label="물품수량" value={item.pbancCmdtyQtyCn} />
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">입찰 일정</p>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="입찰시작" value={fmtDt(item.bidBgngDt)} />
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="입찰마감" value={fmtDt(item.bidDdlnDt)} />
              <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="개찰일자" value={fmtDt(item.bdopnYmd)} />
              <InfoRow icon={<MapPin className="w-3.5 h-3.5" />} label="개찰장소" value={item.bdopnPlcNm} />
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">입찰 결과</p>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="공고결과" value={<ResultBadge result={item.pbancRsltNm} />} />
              <InfoRow label="입찰결과" value={item.bidRsltNmListCn} />
              <InfoRow label="입찰금액" value={item.bidAmtListCn} />
              <InfoRow label="낙찰/유찰사유" value={item.scsbdFlbdRsn} />
              {item.pbancRtrcnRsn && <InfoRow label="공고취소사유" value={item.pbancRtrcnRsn} />}
            </div>
          </div>
        </div>

        {/* 푸터 — 고정 */}
        {item.dtlInfoUrlAddr && (
          <div className="flex-shrink-0 border-t border-gray-100 px-6 py-4">
            <a
              href={item.dtlInfoUrlAddr}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              순환자원정보센터에서 원문 보기
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function Pagination({ current, total, count, pageSize, onChange }: {
  current: number; total: number; count: number; pageSize: number; onChange: (p: number) => void
}) {
  const start = Math.max(1, Math.min(current - 2, total - 4))
  const pages = Array.from({ length: Math.min(5, total) }, (_, i) => start + i)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <p className="text-xs text-gray-400">총 {count.toLocaleString()}건 · {total}페이지</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(current - 1)} disabled={current <= 1}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pages.map(p => (
          <button key={p} onClick={() => onChange(p)}
            className={`w-7 h-7 text-xs rounded-lg border transition-colors ${p === current ? 'bg-blue-600 text-white border-blue-600 font-semibold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(current + 1)} disabled={current >= total}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function EptoPage() {
  useAuth()
  const [activeTab, setActiveTab] = useState<'bids' | 'results'>('bids')

  const [bids, setBids] = useState<BidPbancItem[]>([])
  const [bidTotal, setBidTotal] = useState(0)
  const [bidPage, setBidPage] = useState(1)
  const [bidStatus, setBidStatus] = useState<BidStatusType>('')
  const [bidSearch, setBidSearch] = useState('전기자동차')
  const [bidSearchInput, setBidSearchInput] = useState('전기자동차')

  const [results, setResults] = useState<BidResultItem[]>([])
  const [resultTotal, setResultTotal] = useState(0)
  const [resultPage, setResultPage] = useState(1)
  const [resultStatus, setResultStatus] = useState<BidResultType>('')
  const [resultSearch, setResultSearch] = useState('전기자동차')
  const [resultSearchInput, setResultSearchInput] = useState('전기자동차')

  // 공고명 검색(pbancNm) 결과 중에서 추가로 포함해야 할 키워드 (클라이언트에서 필터링)
  const [bidFilter2, setBidFilter2] = useState('sm3')
  const [resultFilter2, setResultFilter2] = useState('sm3')
  const bidFilter2Active = bidFilter2.trim().length > 0
  const resultFilter2Active = resultFilter2.trim().length > 0

  // 포함 키워드 필터가 켜졌을 때 전체 검색 결과를 담아두는 목록 (클라이언트에서 페이지네이션)
  const [bidFullList, setBidFullList] = useState<BidPbancItem[]>([])
  const [bidFullTruncated, setBidFullTruncated] = useState(false)
  const [bidFilterPage, setBidFilterPage] = useState(1)
  const [resultFullList, setResultFullList] = useState<BidResultItem[]>([])
  const [resultFullTruncated, setResultFullTruncated] = useState(false)
  const [resultFilterPage, setResultFilterPage] = useState(1)

  // 입찰결과 API는 물품명이 없어서, 같은 공고번호(pbancNo)의 입찰공고 물품명(bidCmdtyCn)을 대조해서 필터링한다
  const [resultCmdtyMap, setResultCmdtyMap] = useState<Record<string, string>>({})
  const [resultCmdtyMapTruncated, setResultCmdtyMapTruncated] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [selectedBid, setSelectedBid] = useState<BidPbancItem | null>(null)
  const [selectedResult, setSelectedResult] = useState<BidResultItem | null>(null)
  const autoRefreshTimer = useRef<NodeJS.Timeout | null>(null)

  const fetchBids = useCallback(async (page = bidPage) => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ pageNo: String(page), numOfRows: String(PAGE_SIZE) })
      if (bidSearch) p.set('pbancNm', bidSearch)
      if (bidStatus) p.set('pbancSttsNm', bidStatus)
      const res = await fetch(`/api/e-pto/bids?${p}`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || `오류 ${res.status}`) }
      const data: EptoListResponse<BidPbancItem> = await res.json()
      setBids(data.items); setBidTotal(data.totalCount); setLastUpdated(new Date())
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [bidPage, bidSearch, bidStatus])

  const fetchResults = useCallback(async (page = resultPage) => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ pageNo: String(page), numOfRows: String(PAGE_SIZE) })
      if (resultSearch) p.set('pbancNm', resultSearch)
      if (resultStatus) p.set('pbancRsltNm', resultStatus)
      const res = await fetch(`/api/e-pto/results?${p}`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || `오류 ${res.status}`) }
      const data: EptoListResponse<BidResultItem> = await res.json()
      setResults(data.items); setResultTotal(data.totalCount); setLastUpdated(new Date())
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [resultPage, resultSearch, resultStatus])

  // 포함 키워드 필터가 켜졌을 때: 페이지 단위가 아니라 검색 결과 전체를 가져와 클라이언트에서 필터링+페이지네이션한다
  const fetchBidsFull = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ pageNo: '1', numOfRows: String(FULL_FETCH_CAP) })
      if (bidSearch) p.set('pbancNm', bidSearch)
      if (bidStatus) p.set('pbancSttsNm', bidStatus)
      const res = await fetch(`/api/e-pto/bids?${p}`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || `오류 ${res.status}`) }
      const data: EptoListResponse<BidPbancItem> = await res.json()
      setBidFullList(data.items); setBidTotal(data.totalCount)
      setBidFullTruncated(data.totalCount > data.items.length)
      setLastUpdated(new Date())
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [bidSearch, bidStatus])

  const fetchResultsFull = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ pageNo: '1', numOfRows: String(FULL_FETCH_CAP) })
      if (resultSearch) p.set('pbancNm', resultSearch)
      if (resultStatus) p.set('pbancRsltNm', resultStatus)
      // 입찰결과 API는 물품명이 없으므로, 같은 검색어의 입찰공고를 함께 가져와 공고번호로 물품명을 대조한다
      const bp = new URLSearchParams({ pageNo: '1', numOfRows: String(FULL_FETCH_CAP) })
      if (resultSearch) bp.set('pbancNm', resultSearch)

      const [res, bidsRes] = await Promise.all([
        fetch(`/api/e-pto/results?${p}`),
        fetch(`/api/e-pto/bids?${bp}`),
      ])
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || `오류 ${res.status}`) }
      const data: EptoListResponse<BidResultItem> = await res.json()
      setResultFullList(data.items); setResultTotal(data.totalCount)
      setResultFullTruncated(data.totalCount > data.items.length)

      if (bidsRes.ok) {
        const bidsData: EptoListResponse<BidPbancItem> = await bidsRes.json()
        const map: Record<string, string> = {}
        bidsData.items.forEach(b => { map[b.pbancNo] = b.bidCmdtyCn })
        setResultCmdtyMap(map)
        setResultCmdtyMapTruncated(bidsData.totalCount > bidsData.items.length)
      } else {
        setResultCmdtyMap({})
        setResultCmdtyMapTruncated(false)
      }
      setLastUpdated(new Date())
    } catch (e) { setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [resultSearch, resultStatus])

  // 검색 조건이 그대로인데 탭만 왔다갔다 하는 경우, 이미 가져온 데이터를 재사용하고 재조회하지 않는다
  // (외부 공공API 응답이 느려서, 탭 전환마다 매번 다시 불러오면 체감 속도가 크게 떨어진다)
  const bidsFetchKeyRef = useRef<string | null>(null)
  const resultsFetchKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeTab !== 'bids') return
    const key = bidFilter2Active ? `full:${bidSearch}:${bidStatus}` : `page:${bidPage}:${bidSearch}:${bidStatus}`
    if (bidsFetchKeyRef.current === key) return
    bidsFetchKeyRef.current = key
    if (bidFilter2Active) fetchBidsFull()
    else fetchBids(bidPage)
  }, [activeTab, bidPage, bidSearch, bidStatus, bidFilter2Active, fetchBidsFull, fetchBids])

  useEffect(() => {
    if (activeTab !== 'results') return
    const key = resultFilter2Active ? `full:${resultSearch}:${resultStatus}` : `page:${resultPage}:${resultSearch}:${resultStatus}`
    if (resultsFetchKeyRef.current === key) return
    resultsFetchKeyRef.current = key
    if (resultFilter2Active) fetchResultsFull()
    else fetchResults(resultPage)
  }, [activeTab, resultPage, resultSearch, resultStatus, resultFilter2Active, fetchResultsFull, fetchResults])

  // 검색 조건이 바뀌면 포함 키워드 필터의 클라이언트 페이지도 1페이지로 초기화
  useEffect(() => { setBidFilterPage(1) }, [bidSearch, bidStatus, bidFilter2Active])
  useEffect(() => { setResultFilterPage(1) }, [resultSearch, resultStatus, resultFilter2Active])

  useEffect(() => {
    if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current)
    if (autoRefresh) {
      autoRefreshTimer.current = setInterval(() => {
        if (activeTab === 'bids') { bidFilter2Active ? fetchBidsFull() : fetchBids(bidPage) }
        else { resultFilter2Active ? fetchResultsFull() : fetchResults(resultPage) }
      }, AUTO_REFRESH_MS)
    }
    return () => { if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current) }
  }, [autoRefresh, activeTab, fetchBids, fetchResults, fetchBidsFull, fetchResultsFull, bidPage, resultPage, bidFilter2Active, resultFilter2Active])

  const handleBidSearch = () => { setBidSearch(bidSearchInput); setBidPage(1) }
  const handleResultSearch = () => { setResultSearch(resultSearchInput); setResultPage(1) }

  // 입찰물품(bidCmdtyCn)에 포함 키워드가 있는지로, 전체 검색 결과(bidFullList)를 기준으로 필터링
  const filteredBids = useMemo(() => {
    if (!bidFilter2Active) return []
    const kw = bidFilter2.trim().toLowerCase()
    return bidFullList.filter(b => b.bidCmdtyCn.toLowerCase().includes(kw))
  }, [bidFullList, bidFilter2, bidFilter2Active])

  // 입찰결과 API에는 물품명이 없어 같은 공고번호의 입찰공고 물품명(resultCmdtyMap)을 대조해 필터링.
  // 대응하는 입찰공고를 찾지 못한 경우에만 공고명으로 대체 판정한다.
  const filteredResults = useMemo(() => {
    if (!resultFilter2Active) return []
    const kw = resultFilter2.trim().toLowerCase()
    return resultFullList.filter(r => {
      const cmdty = resultCmdtyMap[r.pbancNo]
      if (cmdty !== undefined) return cmdty.toLowerCase().includes(kw)
      return r.pbancNm.toLowerCase().includes(kw)
    })
  }, [resultFullList, resultFilter2, resultFilter2Active, resultCmdtyMap])

  // 화면에 보여줄 목록/총건수/현재 페이지: 포함 키워드가 켜져 있으면 필터링된 전체 결과를 클라이언트에서 페이지네이션
  const bidDisplayList = bidFilter2Active
    ? filteredBids.slice((bidFilterPage - 1) * PAGE_SIZE, bidFilterPage * PAGE_SIZE)
    : bids
  const bidDisplayTotal = bidFilter2Active ? filteredBids.length : bidTotal
  const bidDisplayPage = bidFilter2Active ? bidFilterPage : bidPage
  const setBidDisplayPage = bidFilter2Active ? setBidFilterPage : setBidPage

  const resultDisplayList = resultFilter2Active
    ? filteredResults.slice((resultFilterPage - 1) * PAGE_SIZE, resultFilterPage * PAGE_SIZE)
    : results
  const resultDisplayTotal = resultFilter2Active ? filteredResults.length : resultTotal
  const resultDisplayPage = resultFilter2Active ? resultFilterPage : resultPage
  const setResultDisplayPage = resultFilter2Active ? setResultFilterPage : setResultPage

  const actions = (
    <div className="flex items-center gap-2">
      {lastUpdated && (
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 업데이트
        </span>
      )}
      <button
        onClick={() => setAutoRefresh(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
          autoRefresh ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} />
        {autoRefresh ? '자동갱신 ON' : '자동갱신 OFF'}
      </button>
      <button
        onClick={() => {
          if (activeTab === 'bids') { bidFilter2Active ? fetchBidsFull() : fetchBids(bidPage) }
          else { resultFilter2Active ? fetchResultsFull() : fetchResults(resultPage) }
        }}
        disabled={loading}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        새로고침
      </button>
    </div>
  )

  return (
    <AdminLayout title="한국환경공단 순환자원정보센터 실시간 조회" actions={actions}>
      <div className="flex flex-col gap-4">

        {/* 탭 + 필터 카드 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          {/* 탭 */}
          <div className="flex border-b border-gray-100 px-4 pt-1">
            {([
              { key: 'bids', label: '입찰 공고', count: bidTotal },
              { key: 'results', label: '입찰 결과', count: resultTotal },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {tab.count.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 필터 바 */}
          <div className="flex items-center gap-2 px-4 py-3 flex-wrap">
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="공고명 검색..."
                value={activeTab === 'bids' ? bidSearchInput : resultSearchInput}
                onChange={e => activeTab === 'bids' ? setBidSearchInput(e.target.value) : setResultSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') activeTab === 'bids' ? handleBidSearch() : handleResultSearch() }}
                className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-52 focus:outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-all"
              />
            </div>
            <button
              onClick={() => activeTab === 'bids' ? handleBidSearch() : handleResultSearch()}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              검색
            </button>
            {(activeTab === 'bids' ? bidSearchInput : resultSearchInput) && (
              <button
                onClick={() => {
                  if (activeTab === 'bids') { setBidSearchInput(''); setBidSearch(''); setBidPage(1) }
                  else { setResultSearchInput(''); setResultSearch(''); setResultPage(1) }
                }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg border border-gray-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="h-6 w-px bg-gray-200" />

            {/* 추가 포함 키워드 (검색 결과 내 클라이언트 필터링) */}
            <div className="relative">
              <input
                type="text"
                placeholder="포함 키워드 (예: SM3)"
                value={activeTab === 'bids' ? bidFilter2 : resultFilter2}
                onChange={e => activeTab === 'bids' ? setBidFilter2(e.target.value) : setResultFilter2(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm w-40 focus:outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-all"
              />
            </div>
            {(activeTab === 'bids' ? bidFilter2 : resultFilter2) && (
              <button
                onClick={() => activeTab === 'bids' ? setBidFilter2('') : setResultFilter2('')}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg border border-gray-200 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="h-6 w-px bg-gray-200" />

            {/* 상태 필터 */}
            {activeTab === 'bids' ? (
              <div className="relative">
                <select
                  value={bidStatus}
                  onChange={e => { setBidStatus(e.target.value as BidStatusType); setBidPage(1) }}
                  className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-gray-700"
                >
                  <option value="">전체 상태</option>
                  <option value="입찰중">입찰중</option>
                  <option value="재입찰중">재입찰중</option>
                  <option value="입찰마감">입찰마감</option>
                  <option value="개찰진행중">개찰진행중</option>
                  <option value="개찰완료">개찰완료</option>
                  <option value="공고취소">공고취소</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            ) : (
              <div className="relative">
                <select
                  value={resultStatus}
                  onChange={e => { setResultStatus(e.target.value as BidResultType); setResultPage(1) }}
                  className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-gray-700"
                >
                  <option value="">전체 결과</option>
                  <option value="낙찰">낙찰</option>
                  <option value="부분낙찰">부분낙찰</option>
                  <option value="유찰">유찰</option>
                  <option value="유찰(공고취소)">유찰(공고취소)</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* 오류 */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* 포함 키워드 필터 시 검색 결과가 너무 많아 일부만 가져온 경우 안내 */}
        {((activeTab === 'bids' && bidFilter2Active && bidFullTruncated) ||
          (activeTab === 'results' && resultFilter2Active && (resultFullTruncated || resultCmdtyMapTruncated))) && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            검색 결과가 {FULL_FETCH_CAP.toLocaleString()}건을 초과하여 포함 키워드 필터는 최근 {FULL_FETCH_CAP.toLocaleString()}건 내에서만 적용됩니다. 정확한 확인을 위해 공고명 검색어를 좁혀주세요.
          </div>
        )}

        {/* 테이블 카드 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">불러오는 중...</p>
            </div>
          ) : activeTab === 'bids' ? (
            bidDisplayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Recycle className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-medium">
                  {bidTotal === 0 ? '조회된 입찰 공고가 없습니다.' : '포함 키워드에 맞는 공고가 없습니다.'}
                </p>
                {bidTotal === 0 && bidSearch && (
                  <button onClick={() => { setBidSearchInput(''); setBidSearch(''); setBidPage(1) }}
                    className="text-blue-600 text-xs hover:underline">검색어 초기화</button>
                )}
                {bidTotal > 0 && bidFilter2Active && (
                  <button onClick={() => setBidFilter2('')}
                    className="text-blue-600 text-xs hover:underline">포함 키워드 초기화</button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/70">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[130px]">공고번호</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">공고명</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[160px]">공고자</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[150px]">입찰마감</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[64px]">마감</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[96px]">상태</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {bidDisplayList.map((bid, i) => {
                        const dday = getDDay(bid.bidDdlnDt)
                        return (
                          <tr key={`${bid.pbancNo}-${i}`}
                            className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                            onClick={() => setSelectedBid(bid)}
                          >
                            <td className="px-4 py-3.5">
                              <span className="text-[11px] font-mono text-gray-400">{bid.pbancNo}</span>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="font-semibold text-gray-900 text-sm leading-snug">{bid.pbancNm}</p>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {bid.cmdtyMclsfNm && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-100">
                                    {bid.cmdtyMclsfNm}
                                  </span>
                                )}
                                {bid.cmdtySclsfNm && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                                    {bid.cmdtySclsfNm}
                                  </span>
                                )}
                                {bid.bidCmdtyCn && (
                                  <span className="text-[11px] text-gray-400">{bid.bidCmdtyCn}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="text-sm text-gray-700">{bid.pbancIsrNm}</p>
                            </td>
                            <td className="px-4 py-3.5">
                              <p className="text-sm text-gray-600 tabular-nums">{fmtDt(bid.bidDdlnDt)}</p>
                            </td>
                            <td className="px-3 py-3.5 text-center">
                              <span className={`text-xs font-semibold tabular-nums ${dday.color}`}>{dday.label}</span>
                            </td>
                            <td className="px-3 py-3.5 text-center">
                              <StatusBadge status={bid.pbancSttsNm} />
                            </td>
                            <td className="px-3 py-3.5 text-center">
                              {bid.dtlInfoUrlAddr ? (
                                <a href={bid.dtlInfoUrlAddr} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-gray-300 hover:text-blue-600 transition-colors group-hover:text-blue-400">
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )
          ) : (
            resultDisplayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Recycle className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 font-medium">
                  {resultTotal === 0 ? '조회된 입찰 결과가 없습니다.' : '포함 키워드에 맞는 결과가 없습니다.'}
                </p>
                {resultTotal === 0 && resultSearch && (
                  <button onClick={() => { setResultSearchInput(''); setResultSearch(''); setResultPage(1) }}
                    className="text-blue-600 text-xs hover:underline">검색어 초기화</button>
                )}
                {resultTotal > 0 && resultFilter2Active && (
                  <button onClick={() => setResultFilter2('')}
                    className="text-blue-600 text-xs hover:underline">포함 키워드 초기화</button>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/70">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[130px]">공고번호</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">공고명</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[160px]">공고자</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[120px]">개찰일자</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[130px]">입찰금액</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-[80px]">결과</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {resultDisplayList.map((item, i) => (
                        <tr key={`${item.pbancNo}-${i}`}
                          className="hover:bg-blue-50/30 cursor-pointer transition-colors group"
                          onClick={() => setSelectedResult(item)}
                        >
                          <td className="px-4 py-3.5">
                            <span className="text-[11px] font-mono text-gray-400">{item.pbancNo}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-gray-900 text-sm leading-snug">{item.pbancNm}</p>
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {item.cmdtyMclsfNm && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-100">
                                  {item.cmdtyMclsfNm}
                                </span>
                              )}
                              {item.cmdtySclsfNm && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                                  {item.cmdtySclsfNm}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-sm text-gray-700">{item.pbancIsrNm}</p>
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="text-sm text-gray-600 tabular-nums">{fmtDt(item.bdopnYmd)}</p>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <p className="text-sm font-semibold text-gray-800 tabular-nums">{item.bidAmtListCn || '-'}</p>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <ResultBadge result={item.pbancRsltNm} />
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            {item.dtlInfoUrlAddr ? (
                              <a href={item.dtlInfoUrlAddr} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="text-gray-300 hover:text-blue-600 transition-colors group-hover:text-blue-400">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          )}

          {!loading && activeTab === 'bids' && bidDisplayTotal > PAGE_SIZE && (
            <Pagination current={bidDisplayPage} total={Math.ceil(bidDisplayTotal / PAGE_SIZE)} count={bidDisplayTotal} pageSize={PAGE_SIZE} onChange={setBidDisplayPage} />
          )}
          {!loading && activeTab === 'results' && resultDisplayTotal > PAGE_SIZE && (
            <Pagination current={resultDisplayPage} total={Math.ceil(resultDisplayTotal / PAGE_SIZE)} count={resultDisplayTotal} pageSize={PAGE_SIZE} onChange={setResultDisplayPage} />
          )}
        </div>
      </div>

      {selectedBid && <BidDetailModal item={selectedBid} onClose={() => setSelectedBid(null)} />}
      {selectedResult && <ResultDetailModal item={selectedResult} onClose={() => setSelectedResult(null)} />}
    </AdminLayout>
  )
}
