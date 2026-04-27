'use client';

import { DpfVehicle } from '@/types/dpf';

interface Props {
  vehicle: DpfVehicle;
}

function parseDate(dateStr?: string | null): { year: string; month: string; day: string } {
  if (!dateStr) return { year: '', month: '', day: '' };
  const d = dateStr.split('T')[0].split('-');
  return { year: d[0] ?? '', month: d[1] ?? '', day: d[2] ?? '' };
}

export default function Annex3Form({ vehicle }: Props) {
  const raw = vehicle.raw_data ?? {};
  const deviceType = String(raw['부착장치'] ?? '');
  const inst = parseDate(vehicle.installation_date);

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
      <div style={{ fontSize: '9px', marginBottom: '2px' }}>[별지 제3호 서식]</div>

      {/* 제목 */}
      <h1 style={{ textAlign: 'center', fontSize: '15px', fontWeight: 'bold', marginBottom: '2px' }}>
        보조금 지급 청구서 및 위임장
      </h1>
      <p style={{ textAlign: 'center', fontSize: '9px', marginBottom: '12px' }}>
        (소유자가 제작사 및 사업자에게 제출하는 사항임)
      </p>

      {/* 차량 정보 테이블 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '78%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td className={headerCell} rowSpan={5} style={{ textAlign: 'center', fontSize: '12px', verticalAlign: 'middle' }}>
              차량 또는<br />건설기계의<br />표시
            </td>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>차량 또는 건설기계 등록번호 : </span>
              {vehicle.plate_number}
            </td>
          </tr>
          <tr>
            <td className={cell} style={{ height: '6px' }}>&nbsp;</td>
          </tr>
          <tr>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>차명 또는 건설기계명 : </span>
              {vehicle.vehicle_name ?? ''}
            </td>
          </tr>
          <tr>
            <td className={cell} style={{ height: '6px' }}>&nbsp;</td>
          </tr>
          <tr>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>저감장치 또는 엔진(모터 등) 종류 : </span>
              {deviceType}
            </td>
          </tr>
          <tr>
            <td className={headerCell} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
              장치부착<br />(엔진교체·개조)일
            </td>
            <td className={cell} style={{ paddingTop: '6px', paddingBottom: '6px' }}>
              {inst.year
                ? `${inst.year}년 ${inst.month}월 ${inst.day}일`
                : '년      월      일'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 신청 본문 */}
      <div style={{ fontSize: '11px', lineHeight: '1.8', marginBottom: '16px' }}>
        20&nbsp;&nbsp;&nbsp;&nbsp;년 운행차 배출가스저감 사업과 관련하여 「대기관리권역의 대기환경개선에 관한 특별법」
        제26조 또는 「대기환경보전법」 제58조에 따른 보조금의 지급을 위와 같이 신청합니다.
      </div>

      <div style={{ textAlign: 'center', marginBottom: '6px', fontSize: '11px' }}>
        년&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;일
      </div>
      <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '6px' }}>
        신&nbsp;청&nbsp;자:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인)
      </div>
      <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '20px' }}>
        {vehicle.local_government ? `${vehicle.local_government} 시장(도지사)` : '○○○○ 시장(도지사)'}&nbsp;&nbsp;귀하
      </div>

      <hr style={{ borderTop: '2px solid black', marginBottom: '12px' }} />

      {/* 위임장 제목 */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
        &lt; 보조금 등의 청구 및 수령권 위임에 관한 사항 &gt;
      </div>

      {/* 위임 내용 테이블 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td className={headerCell} style={{ width: '22%', textAlign: 'center' }}>위임의 내용</td>
            <td className={cell}>
              {vehicle.local_government ?? 'OOO'}시 보조금 등의 청구 및 수령권 위임
            </td>
          </tr>
          <tr>
            <td className={headerCell} style={{ textAlign: 'center' }}>위임한 보조금액</td>
            <td className={cell}>금&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;원정</td>
          </tr>
        </tbody>
      </table>

      {/* 위임인 / 대리인 테이블 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <colgroup>
          <col style={{ width: '50%' }} />
          <col style={{ width: '50%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className={headerCell} style={{ textAlign: 'center' }}>위 임 인</th>
            <th className={headerCell} style={{ textAlign: 'center' }}>대 리 인</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={cell} style={{ verticalAlign: 'top', lineHeight: '2.0' }}>
              소유자: {vehicle.owner_name ?? ''}&nbsp;&nbsp;&nbsp;&nbsp;㊞<br />
              주민등록번호:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br />
              주소: {vehicle.owner_address ?? ''}<br />
              <br />
              운행자:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;㊞<br />
              주민등록번호:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br />
              주소:
            </td>
            <td className={cell} style={{ verticalAlign: 'top', lineHeight: '2.0' }}>
              대리인: (장치제작사 또는 엔진교체·개조사업자)&nbsp;&nbsp;㊞<br />
              <br />
              주소: (장치제작사 또는 엔진교체·개조 사업자 주소)<br />
              <br />
              <br />
              위 사람을 대리인으로 정하고 위 권한을 위임합니다.
            </td>
          </tr>
          <tr>
            <td className={headerCell} colSpan={2} style={{ fontSize: '9px' }}>
              소유자와의 관계: (성명은 반드시 정자로 기재하여 주시기 바랍니다)
            </td>
          </tr>
        </tbody>
      </table>

      {/* 유의사항 */}
      <div style={{ fontSize: '9px', lineHeight: '1.6' }}>
        <span style={{ fontWeight: 'bold' }}>※ 유의사항</span><br />
        1. 이 위임장은 보조금의 청구 및 수령을 위한 것으로 위임 목적 이외의 용도로는 사용할 수 없습니다.<br />
        2. 위임인(소유자)은 반드시 자필로 서명하거나 도장을 날인하여야 합니다.<br />
        3. 이 위임장은 해당 저공해조치 완료 시까지 유효합니다.
      </div>
    </div>
  );
}
