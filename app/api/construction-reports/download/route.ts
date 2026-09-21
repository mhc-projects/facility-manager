// app/api/construction-reports/download/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
  ShadingType,
  PageBreak,
  convertInchesToTwip
} from 'docx'

// request.url을 읽으므로 정적 렌더링 대상에서 제외한다 (빌드 시 Dynamic server usage 오류 방지)
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

// 날짜 포맷팅
function formatDate(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

// 성명에 글자 사이 공백 추가
function formatNameWithSpaces(name: string): string {
  if (!name) return ''
  return name.split('').join(' ')
}

// 숫자를 천단위 콤마 포맷팅
function formatNumber(num: number | undefined | null): string {
  if (!num) return '0'
  return num.toLocaleString()
}

// 테이블 셀 생성 헬퍼 함수
function createTableCell(
  text: string,
  options: {
    bold?: boolean
    shading?: boolean
    width?: number
    colspan?: number
    rowspan?: number
    verticalAlign?: VerticalAlign
    alignment?: AlignmentType
  } = {}
): TableCell {
  const {
    bold = false,
    shading = false,
    width,
    colspan,
    rowspan,
    verticalAlign = VerticalAlign.CENTER,
    alignment = AlignmentType.CENTER
  } = options

  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold,
            font: 'Malgun Gothic',
            size: 20 // 10pt
          })
        ],
        alignment
      })
    ],
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    columnSpan: colspan,
    rowSpan: rowspan,
    verticalAlign,
    shading: shading
      ? {
          fill: 'D9D9D9',
          type: ShadingType.SOLID
        }
      : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 2, color: '000000' }
    }
  })
}

// Page 1: 착공신고서 생성
function createPage1(data: any): Paragraph[] {
  const reportDate = new Date(data.report_date)
  const year = reportDate.getFullYear()
  const month = reportDate.getMonth() + 1
  const day = reportDate.getDate()

  const approvalDate = new Date(data.subsidy_approval_date)
  const endDate = new Date(approvalDate)
  endDate.setMonth(endDate.getMonth() + 3)

  const selfPayment = (data.government_notice_price || 0) - (data.subsidy_amount || 0)
  const businessVat = Math.round((data.government_notice_price || 0) * 0.1)
  const depositAmountIot = selfPayment + businessVat

  const additionalCost = data.additional_cost || 0
  const additionalCostVat = Math.round(additionalCost * 0.1)
  const additionalCostWithVat = Math.round(additionalCost * 1.1)

  const negotiationCost = data.negotiation_cost || 0
  const negotiationCostVat = Math.round(negotiationCost * 0.1)
  const negotiationCostWithVat = Math.round(negotiationCost * 1.1)

  const totalSupplyAmount = (data.government_notice_price || 0) + additionalCost + negotiationCost
  const totalVat = businessVat + additionalCostVat + negotiationCostVat
  const totalWithAdditional = depositAmountIot + additionalCostWithVat + negotiationCostWithVat

  const preventionFacilitiesText = (data.prevention_facilities || [])
    .map((f: any) => `${f.facility_name}${f.capacity ? ` (${f.capacity})` : ''}`)
    .join(', ') || ''

  return [
    // 제목
    new Paragraph({
      children: [
        new TextRun({
          text: '착공 신고서',
          bold: true,
          font: 'Malgun Gothic',
          size: 40 // 20pt
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 150 }
    }),

    // 기본 정보 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell('사 업 장 명', { shading: true, width: 18 }),
            createTableCell(data.business_name || '', { width: 32 }),
            createTableCell('주 소', { shading: true, width: 18 }),
            createTableCell(data.address || '', { width: 32 })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('회 사 연 락 처', { shading: true }),
            createTableCell(data.business_contact || ''),
            createTableCell('팩 스 번 호', { shading: true }),
            createTableCell(data.fax_number || '')
          ]
        }),
        new TableRow({
          children: [
            createTableCell('사 업 자 등 록 번 호', { shading: true }),
            createTableCell(data.business_registration_number || '', { colspan: 3 })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('보 조 금 승 인 일', { shading: true }),
            createTableCell(formatDate(data.subsidy_approval_date)),
            createTableCell('착공신고기한 (보조금승인일+3개월)', { shading: true }),
            createTableCell(formatDate(endDate.toISOString()))
          ]
        }),
        new TableRow({
          children: [
            createTableCell('환 경 부 고 시 가', { shading: true }),
            createTableCell(formatNumber(data.government_notice_price)),
            createTableCell('보 조 금 승 인 액', { shading: true }),
            createTableCell(formatNumber(data.subsidy_amount))
          ]
        }),
        new TableRow({
          children: [
            createTableCell('자 부 담', { shading: true }),
            createTableCell(formatNumber(selfPayment)),
            createTableCell('사 업 비 의 부 가 세', { shading: true }),
            createTableCell(formatNumber(businessVat))
          ]
        }),
        new TableRow({
          children: [
            createTableCell('입금액 IOT (자부담+사업비부가세)', { shading: true }),
            createTableCell(formatNumber(depositAmountIot), { colspan: 3 })
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 200 } }),

    // 추가 비용 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell('추가비용 (공급가)', { shading: true, width: 25 }),
            createTableCell(formatNumber(additionalCost), { width: 25 }),
            createTableCell('추가비용의 VAT', { shading: true, width: 25 }),
            createTableCell(formatNumber(additionalCostVat), { width: 25 })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('추가비용 (공급가+VAT)', { shading: true }),
            createTableCell(formatNumber(additionalCostWithVat), { colspan: 3 })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('네고금액 (공급가)', { shading: true }),
            createTableCell(formatNumber(negotiationCost)),
            createTableCell('네고금액의 VAT', { shading: true }),
            createTableCell(formatNumber(negotiationCostVat))
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 200 } }),

    // 복합 계산 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell('총 공급금액 (환경부고시가+추가비용+네고금액)', { shading: true, width: 40 }),
            createTableCell(formatNumber(totalSupplyAmount), { colspan: 3, width: 60 })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('총 부가세 (사업비부가세+추가비용VAT+네고금액VAT)', { shading: true }),
            createTableCell(formatNumber(totalVat), { colspan: 3 })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('전체 입금액 (자부담+총부가세)', { shading: true }),
            createTableCell(formatNumber(totalWithAdditional), { colspan: 3 })
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 150 } }),

    // 설치 품목 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell('게이트웨이', { shading: true, width: 7.14 }),
            createTableCell((data.gateway || 0).toString(), { width: 7.14 }),
            createTableCell('VPN', { shading: true, width: 7.14 }),
            createTableCell(data.vpn_type === 'wired' ? '유선' : '무선', { width: 7.14 }),
            createTableCell('배출CT', { shading: true, width: 7.14 }),
            createTableCell((data.discharge_current_meter || 0).toString(), { width: 7.14 }),
            createTableCell('방지CT', { shading: true, width: 7.14 }),
            createTableCell((data.prevention_current_meter || 0).toString(), { width: 7.14 }),
            createTableCell('차압계', { shading: true, width: 7.14 }),
            createTableCell((data.differential_pressure_meter || 0).toString(), { width: 7.14 }),
            createTableCell('온도계', { shading: true, width: 7.14 }),
            createTableCell((data.temperature_meter || 0).toString(), { width: 7.14 }),
            createTableCell('PH계', { shading: true, width: 7.14 }),
            createTableCell((data.ph_meter || 0).toString(), { width: 7.14 })
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 150 } }),

    // 방지시설 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell('방지시설명', { shading: true, width: 20 }),
            createTableCell(preventionFacilitiesText, { width: 80 })
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 150 } }),

    // 계약보증금 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createTableCell('계약보증금 (총공급금액의 _____%)', { shading: true, width: 60 }),
            createTableCell(data.contract_bond_rate || '10', { width: 40 })
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 300 } }),

    // 날짜
    new Paragraph({
      children: [
        new TextRun({
          text: `${year}. ${month}. ${day}.`,
          bold: true,
          font: 'Malgun Gothic',
          size: 24 // 12pt
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 150 }
    }),

    // 신청인 정보
    new Paragraph({
      children: [
        new TextRun({
          text: `신청인 : ${data.business_name}   대표 ${formatNameWithSpaces(data.representative_name || '')}   (인)`,
          font: 'Malgun Gothic',
          size: 22 // 11pt
        })
      ],
      alignment: AlignmentType.LEFT,
      spacing: { after: 150 }
    }),

    // 수신자
    new Paragraph({
      children: [
        new TextRun({
          text: `${data.local_government_head || ''}  귀하`,
          bold: true,
          font: 'Malgun Gothic',
          size: 24 // 12pt
        })
      ],
      alignment: AlignmentType.LEFT
    })
  ]
}

// Page 2: 보조금 계약서 생성 (SubsidyContract)
function createPage2(data: any): Paragraph[] {
  const contractDate = formatDate(data.report_date)
  const totalAmount = data.government_notice_price || 0

  return [
    // 제목
    new Paragraph({
      children: [
        new TextRun({
          text: '소규모 방지시설 IoT 설치 계약서',
          bold: true,
          font: 'Malgun Gothic',
          size: 36 // 18pt
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    // 계약번호 및 날짜
    new Paragraph({
      children: [
        new TextRun({
          text: `계약번호: ${data.report_number || ''}`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `체결일자: ${contractDate}`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),

    // 제1조 (계약당사자)
    new Paragraph({
      children: [
        new TextRun({
          text: '제1조(계약당사자)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 계약은 다음 각 호의 당사자 간에 체결된다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '갑. (설치:공급자)',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `상호: 주식회사 블루온`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `대표자: ${data.supplier_representative || '김경수'}`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `소재지: 경상북도 고령군 대가야읍 낫질로 285`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '을. (수요기관 또는 사업참여자)',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `상호: ${data.business_name || ''}`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `대표자: ${data.representative_name || ''}`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `소재지: ${data.address || ''}`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.5) },
      spacing: { after: 200 }
    }),

    // 제2조 (계약의 목적)
    new Paragraph({
      children: [
        new TextRun({
          text: '제2조(계약의 목적)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '본 계약은 「대기환경보전법」 및 관련 지침에 따른 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '소규모 사업장 방지시설 IoT 원격운영관리 시스템',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '(이하 "본 시스템")',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '의 설치 및 유지관리를 통한 환경관리 효율화 및 지속적인 기술지원 체제를 구축하기 위한 것이다.',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제3조 (사업 연계 및 효력 유지)
    new Paragraph({
      children: [
        new TextRun({
          text: '제3조(사업 연계 및 효력 유지)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 사업은 정부 및 지방자치단체의 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '보조금지원사업',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '(소규모 사업장 방지시설 지원사업)',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '과 연계될 수 있다.',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 보조금사업의 승인 여부, 예산 확보, 행정절차의 지연 등과 무관하게 본 계약의 효력은 유지되며, 을은 본 계약에 따른 설비 및 납품을 갑과 지속적으로 진행하여야 한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '3. 보조금이 승인될 경우, 지원금액은 갑이 지자체로부터 수령하며, 미승인 시에는 을이 전액 부담으로 동일 금액을 납부한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '4. 을은 보조금사업 미승인 등을 이유로 본 계약을 일방적으로 해지할 수 없다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '5. 을은 사업장 폐쇄 및 인허가 변경으로인한 IOT의무설치 제외대상 될 경우 예외로 한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제4조 (계약기간)
    new Paragraph({
      children: [
        new TextRun({
          text: '제4조(계약기간)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 계약의 유효기간은 계약체결일로부터 26년12월31일까지 하며, 상호 합의에 따라 연장할 수 있다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제5조 (공급 및 설치 범위)
    new Paragraph({
      children: [
        new TextRun({
          text: '제5조(공급 및 설치 범위)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 갑은 본 시스템의 설계, 제작, 납품, 설치, 사용 및 검증을 일괄 수행한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 구체적인 구성내역 및 설치 위치는 별첨 [시스템 구성 명세서], ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '[설치계획서]',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: ' 에 따른다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 300 }
    }),

    // Page Break before page 2
    new Paragraph({ children: [new PageBreak()] }),

    // 페이지 2 시작
    // 제6조 (대금 및 지급조건)
    new Paragraph({
      children: [
        new TextRun({
          text: '제6조(대금 및 지급조건)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 계약의 총 계약금액은 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: `${formatNumber(totalAmount)}원(부가가치세 별도)`,
          bold: true,
          font: 'Malgun Gothic',
          size: 22
        }),
        new TextRun({
          text: '으로 한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 대금은 계약금, 중도금, 잔금으로 구분하여 지급하며, 지급 일정은 별첨 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '[지급일정표]',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: ' 에 따른다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '3. 보조금이 지급되는 경우, 을은 보조금 수령 후 즉시 갑에게 지급하여야 하며, 보조금 미지급 시 을은 자체 부담으로 동일 금액을 납부한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '4. 을이 정당한 사유 없이 대금지급을 지연할 경우, 갑은 설치를 중단하거나 계약을 해지할 수 있다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제7조 (유지보수 및 기술지원)
    new Paragraph({
      children: [
        new TextRun({
          text: '제7조(유지보수 및 기술지원)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 갑은 설치 완료 후 2년간 무상 유지보수를 제공한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 무상 기간 경과 후에는 상호 협의하여 별도의 유지보수계약을 체결하며, 유상으로 관리한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '3. 갑은 시스템의 안정적 운용을 위해 원격진단, 프로그램 업데이트, 기술교육 등의 서비스를 제공한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제8조 (계약의 해제 및 해지)
    new Paragraph({
      children: [
        new TextRun({
          text: '제8조(계약의 해제 및 해지)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 을이 정당한 사유 없이 본 계약을 이행하지 않거나 대금지급을 지연할 경우, 갑은 서면통보 후 계약을 해지할 수 있다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 보조금사업의 미승인, 예산변경, 또는 사업 중단은 계약 해제의 사유가 되지 아니한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '3. 계약 해지 시, 이미 남품 또는 설치된 장비의 소유권은 갑에게 귀속되며, 을은 이에 대한 손해배상 책임을 부담한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제9조 (비밀유지 및 권리보호)
    new Paragraph({
      children: [
        new TextRun({
          text: '제9조(비밀유지 및 권리보호)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 을은 본 시스템의 구조, 기술사항, 프로그램 등 갑의 지식재산을 제3자에게 누설하거나 복제·이용할 수 없다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 본 시스템 관련 지식재산권은 갑에게 귀속된다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제10조 (손해배상)
    new Paragraph({
      children: [
        new TextRun({
          text: '제10조(손해배상)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '당사자 일방의 귀책사유로 인하여 계약이행이 불가능하게 된 경우, 해당 당사자는 상대방에게 발생한 손해를 배상하여야 한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 300 }
    }),

    // Page Break before page 3
    new Paragraph({ children: [new PageBreak()] }),

    // 페이지 3 시작
    // 제11조 (불가항력)
    new Paragraph({
      children: [
        new TextRun({
          text: '제11조(불가항력)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '천재지변, 전쟁, 법령 개정, 정부 정책 변경 등 불가항력적인 사유로 인한 이행 불능 시, 당사자는 상호 협의하여 대체이행 또는 일정 변경을 조정한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    }),

    // 제12조 (관할법원)
    new Paragraph({
      children: [
        new TextRun({
          text: '제12조(관할법원)',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 계약에 관한 분쟁이 발생할 경우, 갑의 본점 소재지를 관할하는 법원을 관할법원으로 한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 본 계약의 중거로써, 계약서 2부를 작성하여 양 당사자가 각각 서명날인 후 1부석 보관한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 400 }
    }),

    // 서명란
    new Paragraph({
      children: [
        new TextRun({
          text: '갑 : 주식회사 블루온',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `대표이사: ${formatNameWithSpaces(data.supplier_representative || '김경수')} (인)`,
          font: 'Malgun Gothic',
          size: 22
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `을 : ${data.business_name || ''}`,
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `대표이사: ${formatNameWithSpaces(data.representative_name || '')} (인)`,
          font: 'Malgun Gothic',
          size: 22
        })
      ],
      alignment: AlignmentType.CENTER
    })
  ]
}

// Page 3: 자부담 계약서 생성 (SelfPayContract)
function createPage3(data: any): Paragraph[] {
  const contractDate = formatDate(data.report_date)

  // Calculate installation end date (1 month after contract date)
  const startDate = new Date(data.report_date)
  const endDate = new Date(startDate)
  endDate.setMonth(endDate.getMonth() + 1)
  const endMonth = endDate.getMonth() + 1
  const endDay = endDate.getDate()

  // Payment calculations
  const finalAmount = data.total_amount || 0
  const advanceRatio = 50
  const balanceRatio = 50
  const advanceAmount = Math.round((finalAmount * advanceRatio) / 100)
  const balanceAmount = Math.round((finalAmount * balanceRatio) / 100)

  // Equipment counts
  const equipment = {
    ph_meter: data.ph_meter || 0,
    differential_pressure_meter: data.differential_pressure_meter || 0,
    temperature_meter: data.temperature_meter || 0,
    discharge_current_meter: data.discharge_current_meter || 0,
    fan_current_meter: (data.fan_current_meter || 0) + (data.pump_current_meter || 0),
    gateway: data.gateway || 0,
    vpn: data.vpn || 0
  }

  const additionalCost = data.additional_cost || 0
  const negotiationCost = data.negotiation_cost || 0

  return [
    // 페이지 1 - 갑/을 정보 테이블
    // 제목 및 갑/을 통합 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        left: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
        right: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
      },
      rows: [
        // 제목 행
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '공급계약서',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 36
                    })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              columnSpan: 3,
              borders: {
                top: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
                bottom: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
                left: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
                right: { style: BorderStyle.DOUBLE, size: 8, color: '000000' }
              },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 200, bottom: 200 }
            })
          ]
        }),
        // 갑 정보 (6 rows)
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '갑', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              rowSpan: 6,
              width: { size: 10, type: WidthType.PERCENTAGE },
              shading: { fill: 'F3F4F6', type: ShadingType.SOLID },
              verticalAlign: VerticalAlign.CENTER
            }),
            createTableCell('상호', { shading: true, width: 20 }),
            createTableCell(data.business_name || '', { width: 70, alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('주소', { shading: true }),
            createTableCell(data.address || '', { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('성명', { shading: true }),
            createTableCell(formatNameWithSpaces(data.representative_name || ''), { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('사업자등록번호', { shading: true }),
            createTableCell(data.business_registration_number || '000-00-00000', { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('전화번호', { shading: true }),
            createTableCell(data.business_contact || '000-0000-0000', { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('팩스번호', { shading: true }),
            createTableCell(data.fax_number || '000-0000-0000', { alignment: AlignmentType.LEFT })
          ]
        }),
        // 을 정보 (6 rows)
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '을', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              rowSpan: 6,
              shading: { fill: 'F3F4F6', type: ShadingType.SOLID },
              verticalAlign: VerticalAlign.CENTER
            }),
            createTableCell('상호', { shading: true }),
            createTableCell('주식회사 블루온', { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('주소', { shading: true }),
            createTableCell('경상북도 고령군 대가야읍 낫질로 285', { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('성명', { shading: true }),
            createTableCell(formatNameWithSpaces(data.supplier_representative || '김경수'), { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('사업자등록번호', { shading: true }),
            createTableCell('679-86-02827', { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('전화번호', { shading: true }),
            createTableCell('1661-5543', { alignment: AlignmentType.LEFT })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('팩스번호', { shading: true }),
            createTableCell('031-8077-2054', { alignment: AlignmentType.LEFT })
          ]
        })
      ]
    }),

    // 계약 조건 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        left: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
        right: { style: BorderStyle.DOUBLE, size: 8, color: '000000' }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: '1. 무선통신 1기 적용조건(KT 5년 약정, 14,000원 부가세 별도)', font: 'Malgun Gothic', size: 20 })],
                  spacing: { after: 100 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: `2. 선금금 ${advanceRatio}%(`, font: 'Malgun Gothic', size: 20 }),
                    new TextRun({ text: '입금 확인 후 발주 진행', font: 'Malgun Gothic', size: 20, color: 'DC2626' }),
                    new TextRun({ text: `), 부착완료 후 ${balanceRatio}%`, font: 'Malgun Gothic', size: 20 })
                  ],
                  spacing: { after: 100 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: '3. 부착완료신고서 및 그린링크 전송확인서는 설치완료(', font: 'Malgun Gothic', size: 20 }),
                    new TextRun({ text: '입금 확인 후', font: 'Malgun Gothic', size: 20, color: 'DC2626' }),
                    new TextRun({ text: ') 7일 이내 제출', font: 'Malgun Gothic', size: 20 })
                  ],
                  spacing: { after: 100 }
                }),
                new Paragraph({
                  children: [new TextRun({ text: contractDate, font: 'Malgun Gothic', size: 20 })],
                  alignment: AlignmentType.RIGHT
                })
              ],
              margins: { top: 100, bottom: 100, left: 150, right: 150 }
            })
          ]
        })
      ]
    }),

    // 서명란 테이블
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: '000000' },
        bottom: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
        left: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
        right: { style: BorderStyle.DOUBLE, size: 8, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
        insideVertical: { style: BorderStyle.DOUBLE, size: 8, color: '000000' }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '"갑"', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              width: { size: 12, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 200, bottom: 200 }
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: data.business_name || '', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              width: { size: 38, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '"을"', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              width: { size: 12, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '주식회사 블루온', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              width: { size: 38, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '성명', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 300, bottom: 300 }
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: formatNameWithSpaces(data.representative_name || ''), font: 'Malgun Gothic', size: 24 }),
                    new TextRun({ text: '   (인)', font: 'Malgun Gothic', size: 22 })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              verticalAlign: VerticalAlign.CENTER
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '성명', bold: true, font: 'Malgun Gothic', size: 22 })], alignment: AlignmentType.CENTER })],
              verticalAlign: VerticalAlign.CENTER
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: formatNameWithSpaces(data.supplier_representative || '김경수'), font: 'Malgun Gothic', size: 24 }),
                    new TextRun({ text: '   (인)', font: 'Malgun Gothic', size: 22, color: 'DC2626' })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              verticalAlign: VerticalAlign.CENTER
            })
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 400 } }),
    new Paragraph({ children: [new PageBreak()] }),

    // 페이지 2 - 계약 조항
    new Paragraph({
      children: [
        new TextRun({
          text: '공급계약서',
          bold: true,
          font: 'Malgun Gothic',
          size: 36
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }),

    // 서문
    new Paragraph({
      children: [
        new TextRun({
          text: data.business_name || '',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: ' (이하 "갑"이라 함) 과 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '주식회사 블루온',
          bold: true,
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '(이하 "을"이라 함)은 제품 설치 계약을 상호 이익 준중 및 신의 신뢰와 성실 및 헌책에 따라 다음과 같이 이행한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 400 }
    }),

    // 제1조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 1조 ( 목적 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. "갑"이 구매를 의뢰하여 "을"이 제작하여 "갑"에게 설치 공급하고 상호 협조를 통하여 하기의 본 계약사항 같이 성실히 준수하여, 상호 회사의 이익과 발전에 이바지함을 목적으로 한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 200 }
    }),

    // 제2조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 2조 ( 계약 내용 및 납품 설치기간 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. "을"은 "갑"이 의뢰한 방지시설 IoT 설비의 납품 및 제작 설치를 수행한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `2. 설치는 ${contractDate}부터 ${endMonth}월 ${endDay}일까지 하며, 구체 일정은 쌍방의 협의에 맞게 협의한다.`,
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 200 }
    }),

    // 제3조 (금액 및 테이블)
    new Paragraph({
      children: [
        new TextRun({
          text: '제 3조 ( 금액 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: 'IoT 장비 설치관련 총 금액은 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: `₩${formatNumber(finalAmount)}`,
          bold: true,
          font: 'Malgun Gothic',
          size: 22,
          color: 'DC2626'
        }),
        new TextRun({
          text: ' 원으로 다음과 같다.',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '(VAT 별도)',
          font: 'Malgun Gothic',
          size: 20,
          color: 'DC2626'
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 100 }
    }),

    // 장비 테이블
    new Table({
      width: { size: 95, type: WidthType.PERCENTAGE },
      indent: { size: convertInchesToTwip(0.3), type: WidthType.DXA },
      rows: [
        new TableRow({
          children: [
            createTableCell('IoT 구성', { shading: true, width: 12 }),
            createTableCell('PH계', { shading: true, width: 11 }),
            createTableCell('차압계', { shading: true, width: 11 }),
            createTableCell('온도계', { shading: true, width: 11 }),
            createTableCell('배출전류계', { shading: true, width: 11 }),
            createTableCell('송풍+펌프', { shading: true, width: 11 }),
            createTableCell('게이트웨이', { shading: true, width: 11 }),
            createTableCell('VPN', { shading: true, width: 11 }),
            createTableCell('금액 계', { shading: true, width: 11 })
          ]
        }),
        new TableRow({
          children: [
            createTableCell('수량'),
            createTableCell(equipment.ph_meter.toString()),
            createTableCell(equipment.differential_pressure_meter.toString()),
            createTableCell(equipment.temperature_meter.toString()),
            createTableCell(equipment.discharge_current_meter.toString()),
            createTableCell(equipment.fan_current_meter.toString()),
            createTableCell(equipment.gateway.toString()),
            createTableCell(equipment.vpn.toString()),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `₩${formatNumber(finalAmount)}`,
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 20,
                      color: 'DC2626'
                    })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              verticalAlign: VerticalAlign.CENTER
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '추가공사비', font: 'Malgun Gothic', size: 20 })], alignment: AlignmentType.LEFT })],
              columnSpan: 8,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              margins: { left: 100 }
            }),
            createTableCell(`₩${formatNumber(additionalCost)}`)
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '협의사항(네고)', font: 'Malgun Gothic', size: 20 })], alignment: AlignmentType.LEFT })],
              columnSpan: 8,
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              margins: { left: 100 }
            }),
            createTableCell(`₩${formatNumber(negotiationCost)}`)
          ]
        })
      ]
    }),

    new Paragraph({ text: '', spacing: { after: 200 } }),

    // 제4조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 4조 ( 대금 결제 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. "갑"은 "을"에게 발주 시 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: `₩${formatNumber(advanceAmount)}`,
          bold: true,
          font: 'Malgun Gothic',
          size: 22,
          color: 'DC2626'
        }),
        new TextRun({
          text: ' 지급하고, 부착완료 후 잔금 ',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: `₩${formatNumber(balanceAmount)}`,
          bold: true,
          font: 'Malgun Gothic',
          size: 22,
          color: 'DC2626'
        }),
        new TextRun({
          text: ' 을 7일 이내 지급한다.',
          font: 'Malgun Gothic',
          size: 20
        }),
        new TextRun({
          text: '(VAT 별도)',
          font: 'Malgun Gothic',
          size: 20,
          color: 'DC2626'
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '[기업은행 336-101191-04015 주식회사 블루온]',
          bold: true,
          font: 'Malgun Gothic',
          size: 20,
          color: '2563EB'
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. "을"은 설치 완료(입금확인 후)일로부터 7일 이내에 아래 보고서류를 "갑"에게 제출한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '(1) 신호기기 부착완료 신고서',
          font: 'Malgun Gothic',
          size: 18
        })
      ],
      indent: { left: convertInchesToTwip(0.6) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '(2) 그린링크 전송확인서',
          font: 'Malgun Gothic',
          size: 18
        })
      ],
      indent: { left: convertInchesToTwip(0.6) },
      spacing: { after: 400 }
    }),

    new Paragraph({ children: [new PageBreak()] }),

    // 페이지 3 - 나머지 조항
    // 제5조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 5조 ( 하자 보증 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 무상하자 보증 기간은 납품일로부터 24개월로 정한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 보증기간 내에 발생되는 하자에 대하여 수리 및 교환을 하며, 사용상 부주의 및 "갑"의 책임에 의한 하자, 천재 지변은 유상 수리한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 200 }
    }),

    // 제6조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 6조 ( 권리 약무사항 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 계약의 이행에 의한 성과물의 소유권은 "갑"에게 귀속된다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 200 }
    }),

    // 제7조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 7조 ( 계약 해지 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '"갑" 또는 "을"은 상대방이 다음의 각 항목 중 하나에 해당할 때에는 어떤 최고통지를 하지 않고 곧 바로 본 계약을 해지할 수 있다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 파산, 화의 또는 회사정리의 신청을 하거나 이들의 신청이 이루어졌을 때',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.6) },
      spacing: { after: 50 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '2. 타회사의 합병 등의 사유로 물품 대금 결재할 수 없을 때',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.6) },
      spacing: { after: 200 }
    }),

    // 제8조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 8조 ( 계약 유효 기간 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 계약의 유효기간은 계약 체결 일로부터 12개월로 한다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 200 }
    }),

    // 제9조
    new Paragraph({
      children: [
        new TextRun({
          text: '제 9조 ( 기타 사항 )',
          bold: true,
          font: 'Malgun Gothic',
          size: 24
        })
      ],
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: '1. 본 계약상에 명시되지 않은 사항 또는 계약 조항 해석에 이의가 있을 때는 "갑"과 "을"이 협의하여 결정하고 협의가 이루어지지 않을 때는 일반 관례에 따른다.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: 400 }
    }),

    // 계약 확정 문구
    new Paragraph({
      children: [
        new TextRun({
          text: '본 계약을 확정하기 위하여 2부를 작성 상호 날인하여 날인 시점을 확정 시점으로 하고, 이를 증거하기 위하여 각기 1부씩 보관하도록 한다. 끝.',
          font: 'Malgun Gothic',
          size: 20
        })
      ],
      spacing: { after: 200 }
    })
  ]
}

// Page 4: 개선계획서 생성 (전체 표 형태)
function createPage4(data: any): Paragraph[] {
  const reportDate = new Date(data.report_date)
  const year = reportDate.getFullYear()
  const month = reportDate.getMonth() + 1
  const day = reportDate.getDate()

  return [
    // 전체를 하나의 큰 테이블로 구성
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: '000000' },
        bottom: { style: BorderStyle.NONE, size: 0, color: '000000' },
        left: { style: BorderStyle.NONE, size: 0, color: '000000' },
        right: { style: BorderStyle.NONE, size: 0, color: '000000' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
        insideVertical: { style: BorderStyle.SINGLE, size: 2, color: '000000' }
      },
      rows: [
        // 제목 행
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '개선 계획서',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 40
                    })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              columnSpan: 5,
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
                left: { style: BorderStyle.NONE, size: 0, color: '000000' },
                right: { style: BorderStyle.NONE, size: 0, color: '000000' }
              },
              margins: { top: 150, bottom: 150 }
            })
          ]
        }),

        // 기본 정보 행 1
        new TableRow({
          children: [
            createTableCell('신청(배출)업체', { shading: true, width: 18 }),
            createTableCell(data.business_name || '', { width: 25 }),
            createTableCell('총 소요금액\n(보조금)', { shading: true, width: 18, rowspan: 2 }),
            createTableCell(formatNumber(data.government_notice_price) + '원', { width: 27 }),
            createTableCell('(vat\n제외)', { shading: true, width: 12, rowspan: 2 })
          ]
        }),

        // 기본 정보 행 2
        new TableRow({
          children: [
            createTableCell('환경전문공사업체', { shading: true }),
            createTableCell('주식회사 블루온'),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: formatNumber(data.subsidy_amount) + '원',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              shading: {
                fill: 'FFFACD',
                type: ShadingType.SOLID
              },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 2, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 2, color: '000000' }
              },
              verticalAlign: VerticalAlign.CENTER
            })
          ]
        }),

        // 본문 내용 행 (전체 셀 병합)
        new TableRow({
          children: [
            new TableCell({
              children: [
                // 1. 설치 전
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '1. 사물인터넷(IoT) 측정기기 설치 전',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  spacing: { after: 80 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '  • 방지시설 가동여부 : 배출시설 업체에 기록된 적산 전력량 기록지 확인',
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  spacing: { after: 40 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '  • 방지시설 상태정보 : 육안 식별 및 청각 식별(현장 방문 후 필터 및 활성탄)',
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  spacing: { after: 150 }
                }),

                // 2. 설치 후
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '2. 사물인터넷(IoT) 측정기기 설치 후',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  spacing: { after: 80 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '  • 방지시설 가동여부: 송풍기 전류계 설치로 데이터 전송',
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  spacing: { after: 40 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '    (환경공단 소규모 대기배출시설관리시스템(greenlink.or.kr)확인 가능',
                      font: 'Malgun Gothic',
                      size: 18,
                      color: '4B5563'
                    })
                  ],
                  spacing: { after: 40 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '  • 방지시설 상태정보 : 차압계 설치, 배출닥트 출구 온도계 설치로 데이터 전송',
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  spacing: { after: 40 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '    (환경공단 소규모대기배출시설관리시스템(greenlink.or.kr)확인 가능',
                      font: 'Malgun Gothic',
                      size: 18,
                      color: '4B5563'
                    })
                  ],
                  spacing: { after: 150 }
                }),

                // 3. 추가 조치
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '3. 추가 조치 사항',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ],
                  spacing: { after: 80 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '사물인터넷(IoT) 측정기기를 현장조사 후 적정 설치할 것이며 추가 및 변경사항 (데이터 전송, 측정기기 추가 설치 등) 발생 시, 환경전문공사업체 측에서 소요금액 부담 및 추가 조치토록 하겠습니다.',
                      font: 'Malgun Gothic',
                      size: 20
                    })
                  ]
                })
              ],
              columnSpan: 5,
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: '000000' },
                bottom: { style: BorderStyle.NONE, size: 0, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              margins: { top: 150, bottom: 150, left: 150, right: 150 }
            })
          ]
        }),

        // 날짜 행
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${year}. ${month}. ${day}.`,
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 24
                    })
                  ],
                  alignment: AlignmentType.CENTER
                })
              ],
              columnSpan: 5,
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: '000000' },
                bottom: { style: BorderStyle.NONE, size: 0, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              margins: { top: 200, bottom: 200 }
            })
          ]
        }),

        // 서명란 행 1
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '신청(배출)업체 : ',
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: data.business_name || '',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: '   대표 ',
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: formatNameWithSpaces(data.representative_name || ''),
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: '   (인)',
                      font: 'Malgun Gothic',
                      size: 22,
                      color: 'DC2626'
                    })
                  ]
                })
              ],
              columnSpan: 5,
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: '000000' },
                bottom: { style: BorderStyle.NONE, size: 0, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              margins: { top: 200, bottom: 200, left: 150, right: 150 }
            })
          ]
        }),

        // 서명란 행 2
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: '환경전문공사업체 : ',
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: '주식회사 블루온',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: '   대표 ',
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: '김 경 수',
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 22
                    }),
                    new TextRun({
                      text: '   (인)',
                      font: 'Malgun Gothic',
                      size: 22,
                      color: 'DC2626'
                    })
                  ]
                })
              ],
              columnSpan: 5,
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: '000000' },
                bottom: { style: BorderStyle.NONE, size: 0, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              margins: { top: 200, bottom: 200, left: 150, right: 150 }
            })
          ]
        }),

        // 수신자 행
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${data.local_government_head || ''} 귀하`,
                      bold: true,
                      font: 'Malgun Gothic',
                      size: 24
                    })
                  ]
                })
              ],
              columnSpan: 5,
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              margins: { top: 200, bottom: 200, left: 150, right: 150 }
            })
          ]
        })
      ]
    })
  ]
}

// GET: DOCX 파일 다운로드
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const reportId = searchParams.get('id')

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: 'ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // 착공신고서 조회
    const { data: report, error } = await supabase
      .from('construction_reports')
      .select('*')
      .eq('id', reportId)
      .eq('is_deleted', false)
      .single()

    if (error || !report) {
      console.error('[CONSTRUCTION-REPORTS-DOWNLOAD] 조회 오류:', error)
      return NextResponse.json(
        { success: false, error: '착공신고서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const data = report.report_data

    // 데이터 로깅
    console.log('[CONSTRUCTION-REPORTS-DOWNLOAD] Report data:', {
      id: reportId,
      business_name: data.business_name,
      hasData: !!data
    })

    // 문서 생성
    const sections = []

    // Page 1: 착공신고서
    sections.push(...createPage1(data))

    // Page Break
    sections.push(
      new Paragraph({
        children: [new PageBreak()]
      })
    )

    // Page 2: 보조금 계약서 (3 pages)
    sections.push(...createPage2(data))

    // Page Break
    sections.push(
      new Paragraph({
        children: [new PageBreak()]
      })
    )

    // Page 3: 자부담 계약서 (3 pages)
    sections.push(...createPage3(data))

    // Page Break
    sections.push(
      new Paragraph({
        children: [new PageBreak()]
      })
    )

    // Page 4: 개선계획서
    sections.push(...createPage4(data))

    // 문서 생성
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.6),
                bottom: convertInchesToTwip(0.6),
                left: convertInchesToTwip(0.6),
                right: convertInchesToTwip(0.6)
              }
            }
          },
          children: sections
        }
      ]
    })

    // 문서를 버퍼로 변환
    const buffer = await Packer.toBuffer(doc)

    // 파일명 생성
    const fileName = `착공신고서_${report.business_name}_${report.report_number}.docx`

    // Response 헤더 설정
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': buffer.length.toString()
      }
    })
  } catch (error: any) {
    console.error('[CONSTRUCTION-REPORTS-DOWNLOAD] 처리 오류:', error)

    return NextResponse.json(
      {
        success: false,
        error: '서버 오류',
        details: error.message,
        errorType: error.name
      },
      { status: 500 }
    )
  }
}
