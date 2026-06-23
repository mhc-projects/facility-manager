// E-PTO 순환자원정보센터 전자입찰 관련 타입 정의

/** 입찰 공고 정보 (getBidPbancInfo) */
export interface BidPbancItem {
  pbancNo: string            // 공고번호
  pbancNm: string            // 공고명
  pbancIsrNm: string         // 공고자(기관명)
  cmdtyLclsfNm: string       // 물품대분류명
  cmdtyMclsfNm: string       // 물품중분류명
  cmdtySclsfNm: string       // 물품소분류명
  pbancCmdtyQtyCn: string    // 공고물품수량
  picNm: string              // 담당자명
  picTelno: string           // 담당자전화번호
  bidBrfnHdmtYnNm: string    // 입찰설명회개최여부
  bidBgngDt: string          // 입찰시작일시 (YYYYMMDDHHmm)
  bidDdlnDt: string          // 입찰마감일시 (YYYYMMDDHHmm)
  pbancSttsNm: string        // 공고상태 (입찰중|재입찰중|입찰마감|개찰진행중|개찰완료|공고취소)
  bdopnYmd: string           // 개찰일자 (YYYYMMDD)
  bdopnPlcNm: string         // 개찰장소
  bidSeNm: string            // 입찰구분 (매각/매입 등)
  vldBidCrtrPeplCn: string   // 유효입찰성원기준
  bidMthdNm: string          // 입찰방법
  qlfcLmtMttr: string        // 자격제한
  partcptMthdNm: string      // 참가방법
  prcSeNm: string            // 가격구분
  prnmntPrcCn: string        // 예정가격
  bidGtnExpln: string        // 입찰보증금
  gtnPayMthdExpln: string    // 보증금납부방법
  bidCmdtyCn: string         // 입찰물품
  bidCmdtyPrnmntPrcCn: string // 입찰예정가격
  dtlInfoUrlAddr: string     // 상세정보URL
}

/** 입찰 공고결과 정보 (getBidPbancRsltInfo) */
export interface BidResultItem {
  pbancNo: string           // 공고번호
  pbancNm: string           // 공고명
  pbancIsrNm: string        // 공고자(기관명)
  cmdtyLclsfNm: string      // 물품대분류명
  cmdtyMclsfNm: string      // 물품중분류명
  cmdtySclsfNm: string      // 물품소분류명
  pbancCmdtyQtyCn: string   // 공고물품수량
  bidBgngDt: string         // 입찰시작일시
  bidDdlnDt: string         // 입찰마감일시
  bdopnYmd: string          // 개찰일자
  bdopnPlcNm: string        // 개찰장소
  pbancRsltNm: string       // 공고결과 (낙찰|부분낙찰|유찰|유찰(공고취소))
  pbancRtrcnRsn: string     // 공고취소사유
  bidAmtListCn: string      // 입찰금액
  bidRsltNmListCn: string   // 입찰결과
  scsbdFlbdRsn: string      // 낙찰유찰사유
  dtlInfoUrlAddr: string    // 상세정보URL
}

export interface EptoListResponse<T> {
  items: T[]
  pageNo: number
  numOfRows: number
  totalCount: number
  resultCode: string
  resultMsg: string
}

export type BidStatusType =
  | '입찰중'
  | '재입찰중'
  | '입찰마감'
  | '개찰진행중'
  | '개찰완료'
  | '공고취소'
  | ''

export type BidResultType =
  | '낙찰'
  | '부분낙찰'
  | '유찰'
  | '유찰(공고취소)'
  | ''
