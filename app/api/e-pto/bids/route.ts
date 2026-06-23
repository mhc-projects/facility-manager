// 순환자원정보센터 전자입찰 공고 정보 조회 프록시 (getBidPbancInfo)
import { NextRequest, NextResponse } from 'next/server'
import type { BidPbancItem, EptoListResponse } from '@/types/e-pto'

const BASE_URL = 'https://apis.data.go.kr/B552584/kecoapi/bidPbancService/getBidPbancInfo'

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  if (!m) return ''
  return m[1].trim()
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}

function parseItems(xml: string): BidPbancItem[] {
  const items: BidPbancItem[] = []
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
      picNm: xmlVal(x, 'picNm'),
      picTelno: xmlVal(x, 'picTelno'),
      bidBrfnHdmtYnNm: xmlVal(x, 'bidBrfnHdmtYnNm'),
      bidBgngDt: xmlVal(x, 'bidBgngDt'),
      bidDdlnDt: xmlVal(x, 'bidDdlnDt'),
      pbancSttsNm: xmlVal(x, 'pbancSttsNm'),
      bdopnYmd: xmlVal(x, 'bdopnYmd'),
      bdopnPlcNm: xmlVal(x, 'bdopnPlcNm'),
      bidSeNm: xmlVal(x, 'bidSeNm'),
      vldBidCrtrPeplCn: xmlVal(x, 'vldBidCrtrPeplCn'),
      bidMthdNm: xmlVal(x, 'bidMthdNm'),
      qlfcLmtMttr: xmlVal(x, 'qlfcLmtMttr'),
      partcptMthdNm: xmlVal(x, 'partcptMthdNm'),
      prcSeNm: xmlVal(x, 'prcSeNm'),
      prnmntPrcCn: xmlVal(x, 'prnmntPrcCn'),
      bidGtnExpln: xmlVal(x, 'bidGtnExpln'),
      gtnPayMthdExpln: xmlVal(x, 'gtnPayMthdExpln'),
      bidCmdtyCn: xmlVal(x, 'bidCmdtyCn'),
      bidCmdtyPrnmntPrcCn: xmlVal(x, 'bidCmdtyPrnmntPrcCn'),
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
  const pbancSttsNm = searchParams.get('pbancSttsNm') || ''
  const bidBgngDt = searchParams.get('bidBgngDt') || ''
  const bidDdlnDt = searchParams.get('bidDdlnDt') || ''

  // serviceKey는 URLSearchParams가 자동으로 인코딩하므로 디코딩 키를 그대로 사용
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
  if (pbancSttsNm) params.set('pbancSttsNm', pbancSttsNm)
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

    const response: EptoListResponse<BidPbancItem> = {
      items,
      pageNo: parseInt(pageNo, 10),
      numOfRows: parseInt(numOfRows, 10),
      totalCount,
      resultCode,
      resultMsg,
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[E-PTO bids] API 호출 오류:', err)
    return NextResponse.json({ error: '공공API 호출 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
