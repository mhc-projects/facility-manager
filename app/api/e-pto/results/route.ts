// 순환자원정보센터 전자입찰 공고결과 정보 조회 프록시 (getBidPbancRsltInfo)
import { NextRequest, NextResponse } from 'next/server'
import type { BidResultItem, EptoListResponse } from '@/types/e-pto'

const BASE_URL = 'https://apis.data.go.kr/B552584/kecoapi/bidPbancService/getBidPbancRsltInfo'

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  if (!m) return ''
  return m[1].trim()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

function parseItems(xml: string): BidResultItem[] {
  const items: BidResultItem[] = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const x = m[1]
    items.push({
      pbancNo: xmlVal(x, 'pbancNo'),
      pbancNm: xmlVal(x, 'pbancNm'),
      pbancIsrNm: xmlVal(x, 'pbancIsrNm'),
      cmdtyLclsfNm: xmlVal(x, 'cmdtyLclsfNm'),
      cmdtyMclsfNm: xmlVal(x, 'cmdtyMclsfNm'),
      cmdtySclsfNm: xmlVal(x, 'cmdtySclsfNm'),
      pbancCmdtyQtyCn: xmlVal(x, 'pbancCmdtyQtyCn'),
      bidBgngDt: xmlVal(x, 'bidBgngDt'),
      bidDdlnDt: xmlVal(x, 'bidDdlnDt'),
      bdopnYmd: xmlVal(x, 'bdopnYmd'),
      bdopnPlcNm: xmlVal(x, 'bdopnPlcNm'),
      pbancRsltNm: xmlVal(x, 'pbancRsltNm'),
      pbancRtrcnRsn: xmlVal(x, 'pbancRtrcnRsn'),
      bidAmtListCn: xmlVal(x, 'bidAmtListCn'),
      bidRsltNmListCn: xmlVal(x, 'bidRsltNmListCn'),
      scsbdFlbdRsn: xmlVal(x, 'scsbdFlbdRsn'),
      dtlInfoUrlAddr: xmlVal(x, 'dtlInfoUrlAddr'),
    })
  }
  return items
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.EPTO_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API 키가 설정되지 않았습니다. EPTO_API_KEY를 .env.local에 추가하세요.' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const pageNo = searchParams.get('pageNo') || '1'
  const numOfRows = searchParams.get('numOfRows') || '20'
  const pbancNm = searchParams.get('pbancNm') || ''
  const pbancIsrNm = searchParams.get('pbancIsrNm') || ''
  const cmdtyLclsfNm = searchParams.get('cmdtyLclsfNm') || ''
  const cmdtyMclsfNm = searchParams.get('cmdtyMclsfNm') || ''
  const cmdtySclsfNm = searchParams.get('cmdtySclsfNm') || ''
  const pbancRsltNm = searchParams.get('pbancRsltNm') || ''
  const bidBgngDt = searchParams.get('bidBgngDt') || ''
  const bidDdlnDt = searchParams.get('bidDdlnDt') || ''

  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo,
    numOfRows,
    returnType: 'xml',
  })
  if (pbancNm) params.set('pbancNm', pbancNm)
  if (pbancIsrNm) params.set('pbancIsrNm', pbancIsrNm)
  if (cmdtyLclsfNm) params.set('cmdtyLclsfNm', cmdtyLclsfNm)
  if (cmdtyMclsfNm) params.set('cmdtyMclsfNm', cmdtyMclsfNm)
  if (cmdtySclsfNm) params.set('cmdtySclsfNm', cmdtySclsfNm)
  if (pbancRsltNm) params.set('pbancSttsNm', pbancRsltNm)
  if (bidBgngDt) params.set('bidBgngDt', bidBgngDt)
  if (bidDdlnDt) params.set('bidDdlnDt', bidDdlnDt)

  try {
    const res = await fetch(`${BASE_URL}?${params.toString()}`, {
      headers: { Accept: 'application/xml' },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `API 호출 실패: ${res.status}` }, { status: res.status })
    }

    const xml = await res.text()
    const resultCode = xmlVal(xml, 'resultCode')
    const resultMsg = xmlVal(xml, 'resultMsg')

    if (resultCode !== '00' && resultCode !== '200') {
      return NextResponse.json({ error: `API 오류 (${resultCode}): ${resultMsg}` }, { status: 400 })
    }

    const totalCount = parseInt(xmlVal(xml, 'totalCount') || '0', 10)
    const items = parseItems(xml)

    const response: EptoListResponse<BidResultItem> = {
      items,
      pageNo: parseInt(pageNo, 10),
      numOfRows: parseInt(numOfRows, 10),
      totalCount,
      resultCode,
      resultMsg,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[E-PTO results] API 호출 오류:', err)
    return NextResponse.json({ error: '공공API 호출 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
