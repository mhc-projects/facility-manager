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

export default function Annex2Form({ vehicle }: Props) {
  const raw = vehicle.raw_data ?? {};
  const inst = parseDate(vehicle.installation_date);
  const manufacturer = String(raw['제작사'] ?? '');
  const deviceType = String(raw['부착장치'] ?? '');
  const workshopName = String(raw['조치공업사'] ?? '');

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
      <div style={{ fontSize: '9px', marginBottom: '2px' }}>[별지 제2호 서식]</div>

      {/* 제목 */}
      <h1 style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' }}>
        배출가스저감장치 부착 및 저공해엔진(전기) 개조·교체 확인서
      </h1>

      {/* 안내문 */}
      <p style={{ fontSize: '9px', marginBottom: '8px', lineHeight: '1.4' }}>
        ※ 이 확인서는 배출가스저감장치의 부착 및 저공해엔진(전기) 개조·교체 시 제작사(사업자)가 작성하는 서류입니다.
      </p>

      {/* □ 장착차량 현황 */}
      <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>□ 장착차량 현황</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td className={headerCell} style={{ width: '14%' }}>차량소유지</td>
            <td className={cell} style={{ width: '20%' }}>{vehicle.local_government ?? ''}</td>
            <td className={headerCell} style={{ width: '8%' }}>차 명</td>
            <td className={cell} style={{ width: '20%' }}>{vehicle.vehicle_name ?? ''}</td>
            <td className={headerCell} style={{ width: '14%' }}>차량용도<br />(원동기형식)</td>
            <td className={cell} style={{ width: '24%' }}>&nbsp;</td>
          </tr>
          <tr>
            <td className={headerCell}>차량번호</td>
            <td className={cell}>{vehicle.plate_number}</td>
            <td className={headerCell}>연 식</td>
            <td className={cell}>&nbsp;</td>
            <td className={headerCell}>원동기(엔진)형식</td>
            <td className={cell}>&nbsp;</td>
          </tr>
          <tr>
            <td className={headerCell}>차대번호</td>
            <td className={cell} colSpan={3}>{vehicle.vin}</td>
            <td className={headerCell}>소유자</td>
            <td className={cell}>{vehicle.owner_name ?? ''}</td>
          </tr>
          <tr>
            <td className={headerCell} colSpan={2}>배기량&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;cc</td>
            <td className={headerCell} colSpan={2}>출력&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ps</td>
            <td className={headerCell} colSpan={2}>수행거리&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;km</td>
          </tr>
          <tr>
            <td className={cell} style={{ fontSize: '9px' }} colSpan={2}>
              부착 전 KD-147&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;%<br />
              매연농도 lug-down&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;%<br />
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;무부하급가속&nbsp;&nbsp;%
            </td>
            <td className={headerCell} style={{ fontSize: '9px' }} colSpan={2}>엔진</td>
            <td className={cell} style={{ fontSize: '9px' }} colSpan={2}>
              오일소모량&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ℓ/1,000km<br />
              특이사항(차량정비사항)
            </td>
          </tr>
        </tbody>
      </table>

      {/* □ 장치(개조) 현황 */}
      <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>□ 장치(개조) 현황</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}>
        <tbody>
          <tr>
            <td className={headerCell} style={{ width: '14%' }}>장치구분<br />(인증번호)</td>
            <td className={cell} style={{ width: '22%' }}>&nbsp;(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</td>
            <td className={headerCell} style={{ width: '10%' }}>장치종류</td>
            <td className={cell} style={{ width: '20%' }}>{deviceType}</td>
            <td className={headerCell} style={{ width: '14%' }}>제품(일련)번호</td>
            <td className={cell} style={{ width: '20%' }}>{vehicle.device_serial ?? ''}</td>
          </tr>
          <tr>
            <td className={headerCell}>제 작 사</td>
            <td className={cell}>{manufacturer}</td>
            <td className={headerCell}>장착장</td>
            <td className={cell}>{workshopName}</td>
            <td className={headerCell}>장착일</td>
            <td className={cell}>
              {inst.year ? `${inst.year}년 ${inst.month}월 ${inst.day}일` : '년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 준수사항 */}
      <div style={{ border: '1px solid black', padding: '6px', marginBottom: '8px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>【준수사항 및 유의사항】</div>
        <div style={{ fontSize: '9px', lineHeight: '1.6' }}>
          1. 배출가스저감장치 부착 후 매연, 연료소모량, 출력 등이 심하게 나빠진다고 생각되면, 저감장치 부착 전 점검기관(공업사)에 반드시 확인하여 주시기 바랍니다.<br />
          2. 배출가스저감장치의 필터(DPF)는 주행 중 자동 재생되나, 과적·과속·저속운행이 빈번한 차량은 수동재생이 필요할 수도 있습니다.<br />
          3. 배출가스저감장치 부착차량은 저공해 인증을 받은 엔진오일을 사용하여야 합니다.<br />
          4. 이 확인서는 제작사(사업자)가 반드시 보관하여야 합니다.<br />
          5. 배출가스저감장치는 부착 후 반드시 해당 지방자치단체에 구조변경 신고를 하여야 합니다.<br />
          6. 장치 부착 후 이상이 발생한 경우 즉시 제작사(사업자)에 연락하여 주시기 바랍니다.
        </div>
      </div>

      {/* 인수 서류 목록 */}
      <div style={{ border: '1px solid black', padding: '6px', marginBottom: '12px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>【인수 서류】</div>
        <div style={{ fontSize: '9px', lineHeight: '1.6' }}>
          □ 배출가스저감장치 부착 및 저공해엔진 개조·교체 확인서 (본 서식)<br />
          □ 배출가스저감장치 인증서 사본 또는 인증번호 확인 서류<br />
          □ 차량 상태 및 저감장치 부착 품질 확인서
        </div>
      </div>

      {/* 서명란 */}
      <div style={{ fontSize: '10px', lineHeight: '2.2' }}>
        <div style={{ textAlign: 'right', marginBottom: '4px' }}>
          작성자(차량소유자 또는 차량운행자) :&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일&nbsp;&nbsp;&nbsp;&nbsp;연락처(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
        </div>
        <div>
          확인자(장착장)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : (직위)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          (성명)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(인),&nbsp;&nbsp;연락처(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
        </div>
        <div>
          책임자(제작사)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; : (직위)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          (성명)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;,&nbsp;&nbsp;연락처(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
        </div>
      </div>
    </div>
  );
}
