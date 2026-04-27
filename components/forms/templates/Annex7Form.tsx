'use client';

import { DpfVehicle } from '@/types/dpf';

interface Props {
  vehicle: DpfVehicle;
}

type CheckItem = {
  section: string;
  no: string;
  item: string;
  content: string;
  check: string;
};

const BEFORE_ITEMS: CheckItem[] = [
  { section: '부착전점검', no: '1', item: '오일량', content: '엔진오일량 확인', check: '정상□ 상□ 하□' },
  { section: '부착전점검', no: '2', item: '오일점검', content: '엔진오일 (누유, 변색) 여부', check: '양호□ 불량□' },
  { section: '부착전점검', no: '3', item: '스톨TEST', content: '기어중립에서 브레이크누름상태에서 부하를 주었을 때 1800rpm이상이면 정상(필요시 진행)', check: '정상□ 불량□' },
  { section: '부착전점검', no: '4', item: '오일소모량', content: '엔진오일소모량(1L/1000km이내) 오일 교환 전 보충여부(보충□ 미보충□)', check: '양호□ 불량□' },
  { section: '부착전점검', no: '5', item: '엔진부조', content: '엔진노킹현상 및 엔진소리', check: '없음□ 불량□' },
  { section: '부착전점검', no: '6', item: '(인터쿨러)', content: '터보차저, 인터쿨러 상태 확인', check: '양호□ 불량□' },
  { section: '부착전점검', no: '7', item: 'EGR', content: 'EGR 정상여부 확인(EGR 오일누유점검)', check: '양호□ 불량□' },
  { section: '부착전점검', no: '8', item: '블로바이가스', content: '엔진오일캡을 열었을 때 흰연기가 지속적으로 육안으로 확인되면 불량', check: '양호□ 불량□' },
  { section: '부착전점검', no: '9', item: '배연', content: '배연측정(인증 조건 범위 만족 여부)', check: '정상□ 불량□' },
  { section: '부착전점검', no: '10', item: '배기관', content: '배기메니폴더 및 배관 상태', check: '양호□ 불량□' },
  { section: '부착전점검', no: '11', item: '배연', content: '배연측정(10% 만족 여부)', check: '정상□ 불량□' },
  { section: '부착전점검', no: '12', item: '센서위치', content: 'T1,T2,T3,압력호스 위치가 정확한지 확인', check: '정상□ 불량□' },
  { section: '부착전점검', no: '13', item: '체결볼트', content: '볼트너트 등 각 체결부위에 체결상태 확인', check: '정상□ 불량□' },
  { section: '부착전점검', no: '14', item: '연료리턴라인', content: '연료리턴라인에 연료라인 정상연결 및 누유 확인', check: '정상□ 불량□' },
  { section: '부착전점검', no: '15', item: '배선처리', content: '배선처리 확인(너무 늘슨하거나 팽팽하게 처리하면 안됨)', check: '정상□ 불량□' },
  { section: '부착전점검', no: '16', item: '배관절단', content: '배관 파이프 절단 기준 준수 여부 등 확인 ※ 장착도면 참조', check: '정상□ 불량□' },
];

const AFTER_ITEMS: CheckItem[] = [
  { section: '부착후점검', no: '1', item: '용접부', content: '용접상태 및 도장을 하였는지(부식으로 소음발생)', check: '정상□ 불량□' },
  { section: '부착후점검', no: '2', item: '메인커넥터', content: '딸각소리가 나는 등 적정 체결 확인', check: '정상□ 불량□' },
  { section: '부착후점검', no: '3', item: 'KEY ON선', content: '규정위치에 연결 및 배선처리 확인', check: '정상□ 불량□' },
  { section: '부착후점검', no: '4', item: 'KEY ON선 휴즈', content: 'KEY ON선 휴즈 및 홀더정상여부 확인', check: '정상□ 불량□' },
  { section: '부착후점검', no: '5', item: '압력', content: '배압 표출 및 정상여부 확인', check: '정상□ 불량□' },
  { section: '부착후점검', no: '6', item: '운행', content: '시운행을 해서 간섭등에 의한 소음발생여부 확인', check: '정상□ 불량□' },
  { section: '부착후점검', no: '7', item: '수동재생', content: '재생시 백연이나 LEAK(연료누설) 확인 및 정상작동여부 등 확인', check: '정상□ 불량□' },
  { section: '부착후점검', no: '8', item: '자기진단', content: '저감장치 OBD 에러 발생 여부 및 차량 자체 OBD가 적용된 차량은 자기진단기 활용하여 이상 진단 실시', check: '정상□ 불량□' },
];

export default function Annex7Form({ vehicle }: Props) {
  const cell = 'border border-black p-1 text-xs align-top';
  const headerCell = 'border border-black p-1 text-xs font-bold align-middle bg-gray-50';

  return (
    <div
      id="form-print-area"
      style={{
        width: '210mm',
        minHeight: '297mm',
        fontFamily: "'Malgun Gothic', '맑은 고딕', sans-serif",
        fontSize: '11px',
        padding: '10mm',
        backgroundColor: 'white',
        color: 'black',
        margin: '0 auto',
      }}
    >
      {/* 서식 번호 */}
      <div style={{ fontSize: '9px', marginBottom: '2px' }}>[별지 제7호 서식]</div>

      {/* 제목 */}
      <h1 style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold', marginBottom: '8px' }}>
        차량상태 및 저감장치 부착 품질 확인서
      </h1>

      {/* 헤더 테이블 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '38%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td className={headerCell} rowSpan={2} style={{ textAlign: 'center' }}>점검 및<br />부착일자</td>
            <td className={cell} rowSpan={2} style={{ verticalAlign: 'middle' }}>&nbsp;</td>
            <td className={headerCell} style={{ textAlign: 'center' }}>소유자</td>
            <td className={cell}>이름&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
            <td className={cell} rowSpan={2} style={{ textAlign: 'right', verticalAlign: 'bottom' }}>(서명)</td>
          </tr>
          <tr>
            <td className={headerCell} style={{ textAlign: 'center' }}>&nbsp;</td>
            <td className={cell}>연락처&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</td>
          </tr>
          <tr>
            <td className={headerCell} rowSpan={2} style={{ textAlign: 'center' }}>공업사</td>
            <td className={cell}>회사명</td>
            <td className={headerCell} style={{ textAlign: 'center' }}>점검결과</td>
            <td className={cell} colSpan={2}>장착 가능,&nbsp;&nbsp;불가(사유:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td>
          </tr>
          <tr>
            <td className={cell}>직위</td>
            <td className={headerCell} style={{ textAlign: 'center' }}>담당자</td>
            <td className={cell} colSpan={2}>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)</td>
          </tr>
          <tr>
            <td className={headerCell} rowSpan={2} style={{ textAlign: 'center' }}>제작사</td>
            <td className={cell}>회사명</td>
            <td className={cell} colSpan={2}>
              차명: {vehicle.vehicle_name ?? ''}
            </td>
            <td className={cell} rowSpan={2}>&nbsp;</td>
          </tr>
          <tr>
            <td className={cell}>직위</td>
            <td className={headerCell} style={{ textAlign: 'center' }}>담당자</td>
            <td className={cell}>
              (인)&nbsp;&nbsp;자동차/건설기계등록번호: {vehicle.plate_number}<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;주행거리:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;km
            </td>
          </tr>
        </tbody>
      </table>

      {/* 점검표 헤더 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '0' }}>
        <colgroup>
          <col style={{ width: '12%' }} />
          <col style={{ width: '4%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '42%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '8%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className={headerCell} style={{ textAlign: 'center' }}>점검구분</th>
            <th className={headerCell} style={{ textAlign: 'center' }}>No</th>
            <th className={headerCell} style={{ textAlign: 'center' }}>항목</th>
            <th className={headerCell} style={{ textAlign: 'center' }}>내용</th>
            <th className={headerCell} style={{ textAlign: 'center' }}>점검내역</th>
            <th className={headerCell} style={{ textAlign: 'center' }}>비고</th>
          </tr>
        </thead>
        <tbody>
          {/* 부착전점검 */}
          {BEFORE_ITEMS.map((item, idx) => (
            <tr key={`before-${idx}`}>
              {idx === 0 && (
                <td
                  className={headerCell}
                  rowSpan={BEFORE_ITEMS.length}
                  style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '11px' }}
                >
                  부착전<br />점검
                </td>
              )}
              <td className={cell} style={{ textAlign: 'center' }}>{item.no}</td>
              <td className={cell} style={{ fontSize: '9px' }}>{item.item}</td>
              <td className={cell} style={{ fontSize: '9px' }}>{item.content}</td>
              <td className={cell} style={{ fontSize: '9px' }}>{item.check}</td>
              <td className={cell}>&nbsp;</td>
            </tr>
          ))}

          {/* 부착후점검 */}
          {AFTER_ITEMS.map((item, idx) => (
            <tr key={`after-${idx}`}>
              {idx === 0 && (
                <td
                  className={headerCell}
                  rowSpan={AFTER_ITEMS.length}
                  style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: '11px' }}
                >
                  부착후<br />점검
                </td>
              )}
              <td className={cell} style={{ textAlign: 'center' }}>{item.no}</td>
              <td className={cell} style={{ fontSize: '9px' }}>{item.item}</td>
              <td className={cell} style={{ fontSize: '9px' }}>{item.content}</td>
              <td className={cell} style={{ fontSize: '9px' }}>{item.check}</td>
              <td className={cell}>&nbsp;</td>
            </tr>
          ))}

          {/* 특이사항 */}
          <tr>
            <td className={headerCell} colSpan={2} style={{ textAlign: 'center' }}>특이사항</td>
            <td className={cell} colSpan={4} style={{ height: '48px' }}>&nbsp;</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
