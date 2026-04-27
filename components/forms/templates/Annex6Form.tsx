'use client';

import { DpfVehicle } from '@/types/dpf';

interface Props {
  vehicle: DpfVehicle;
}

export default function Annex6Form({ vehicle }: Props) {
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
      <div style={{ fontSize: '9px', marginBottom: '2px' }}>[별지 제6호 서식]</div>

      {/* 제목 */}
      <h1 style={{ textAlign: 'center', fontSize: '16px', fontWeight: 'bold', marginBottom: '6px' }}>
        자동차 및 건설기계 저공해조치 신청서
      </h1>
      <p style={{ textAlign: 'center', fontSize: '9px', marginBottom: '14px' }}>
        (앞 쪽)
      </p>

      {/* 신청자 정보 테이블 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
        <colgroup>
          <col style={{ width: '15%' }} />
          <col style={{ width: '85%' }} />
        </colgroup>
        <tbody>
          <tr>
            <td className={headerCell} rowSpan={8} style={{ textAlign: 'center', fontSize: '13px', verticalAlign: 'middle' }}>
              신&nbsp;청&nbsp;인<br />(자동차·<br />건설기계<br />소유자)
            </td>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>자동차·건설기계 번호 : </span>
              {vehicle.plate_number}
            </td>
          </tr>
          <tr>
            <td className={cell} style={{ height: '8px' }}>&nbsp;</td>
          </tr>
          <tr>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>소유자 성명 : </span>
              {vehicle.owner_name ?? ''}
            </td>
          </tr>
          <tr>
            <td className={cell} style={{ height: '8px' }}>&nbsp;</td>
          </tr>
          <tr>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>차대번호 : </span>
              {vehicle.vin}
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>자동차·건설기계명 : </span>
              {vehicle.vehicle_name ?? ''}
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>(자동차의 경우) 형식 및 연식 제원번호 : </span>
              &nbsp;
            </td>
          </tr>
          <tr>
            <td className={cell} style={{ height: '8px' }}>&nbsp;</td>
          </tr>
          <tr>
            <td className={headerCell} rowSpan={2} style={{ textAlign: 'center', fontSize: '13px', verticalAlign: 'middle' }}>
              신&nbsp;청&nbsp;인
            </td>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>연락처(휴대전화) : </span>
              {vehicle.owner_contact ?? ''}
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>(팩스번호) : </span>
              &nbsp;
            </td>
          </tr>
          <tr>
            <td className={headerCell} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
              주&nbsp;&nbsp;&nbsp;소
            </td>
            <td className={cell}>
              <span style={{ fontWeight: 'bold' }}>사용본거지 주소 : </span>
              {vehicle.owner_address ?? ''}
            </td>
          </tr>
        </tbody>
      </table>

      {/* 저공해조치 신청 내용 */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
        <tbody>
          <tr>
            <td className={headerCell} style={{ width: '20%', textAlign: 'center', verticalAlign: 'middle' }}>
              저공해조치<br />신청<br />(복수체크 가능)
            </td>
            <td className={cell} style={{ lineHeight: '2.0' }}>
              □ 전동화 개조&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;□ Stage-5(가스엔진 포함) 교체<br />
              □ Tier 4 교체&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;□ Tier 3 교체<br />
              <span style={{ fontSize: '9px' }}>
                ※ Stage-5 또는 Tier-4 엔진으로 교체 가능한 건설기계의 경우에는 해당 엔진으로 교체하여야 합니다.<br />
                ※ 저공해조치 신청은 소유자 본인이 하여야 하며, 대리 신청 시에는 위임장을 첨부하여야 합니다.
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 본문 */}
      <div style={{ fontSize: '11px', lineHeight: '1.8', marginBottom: '20px' }}>
        위 자동차·건설기계에 대하여 「대기환경보전법」 등 관련법 및 규정에 따른 저공해조치를 신청하오니
        신청에 따른 조치를 하여 주시기 바랍니다.
      </div>

      {/* 날짜 및 서명 */}
      <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '11px' }}>
        년&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;일
      </div>
      <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '24px' }}>
        소유자명&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;서명
      </div>

      {/* 지자체장 수신 */}
      <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '20px' }}>
        {vehicle.local_government ? `${vehicle.local_government} 시장(도지사)` : '○○○○ 시장(도지사)'}&nbsp;&nbsp;귀하
      </div>

      <hr style={{ borderTop: '1px solid black', marginBottom: '12px' }} />

      {/* 개인정보 수집 동의 */}
      <div style={{ border: '1px solid black', padding: '8px', fontSize: '9px', lineHeight: '1.6' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
          (개인정보 수집·이용 동의에 관한 사항)
        </div>
        귀하에서 본 신청서에 기재하신 사항(주소 및 연락처 등)은 저공해조치 안내 등을 위하여
        「개인정보보호법」 제15조 및 제22조에 근거하여 수집·이용합니다.
        수집한 개인정보는 저공해조치 업무 처리 목적 이외의 용도로 이용하거나 타인 또는 타기관에 제공하지 않습니다.<br />
        귀하는 개인정보 수집·이용에 동의하지 않을 수 있으나, 동의하지 않을 경우 서비스 이용에 제한이 있을 수 있습니다.
        <div style={{ marginTop: '8px' }}>
          개인정보 수집·이용에 동의하십니까?&nbsp;&nbsp;&nbsp;&nbsp;□ 동의함&nbsp;&nbsp;&nbsp;&nbsp;□ 동의하지 않음
        </div>
      </div>
    </div>
  );
}
