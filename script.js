document.addEventListener('DOMContentLoaded', () => {
    // Select all inputs to attach event listeners
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('input', calculateDose);
    });

    // Helper to get float value from input safely
    function getVal(id) {
        const val = parseFloat(document.getElementById(id).value);
        return isNaN(val) ? null : val;
    }

    function calculateDose() {
        // 1. Calculate kTP (Temperature & Pressure Correction)
        const t0 = getVal('t0');
        const p0 = getVal('p0');
        const t_meas = getVal('t_meas');
        const p_meas = getVal('p_meas');
        
        let kTP = 1.0;
        if (t0 !== null && p0 !== null && t_meas !== null && p_meas !== null && p_meas !== 0) {
            kTP = ((273.15 + t_meas) / (273.15 + t0)) * (p0 / p_meas);
            document.getElementById('kTP_result').textContent = kTP.toFixed(4);
        } else {
            document.getElementById('kTP_result').textContent = "---";
        }

        // 2. Calculate kpol (Polarity Correction)
        const m_pos = getVal('m_pos');
        const m_neg = getVal('m_neg');
        const m_routine = getVal('m_routine');

        let kPol = 1.0;
        if (m_pos !== null && m_neg !== null && m_routine !== null && m_routine !== 0) {
            kPol = (Math.abs(m_pos) + Math.abs(m_neg)) / (2 * Math.abs(m_routine));
            document.getElementById('kPol_result').textContent = kPol.toFixed(4);
        } else {
            document.getElementById('kPol_result').textContent = "---";
        }

        // 3. Calculate ks (Recombination Correction - Two Voltage Method for Pulsed Beams)
        const v1 = getVal('v1');
        const v2 = getVal('v2');
        const m1 = getVal('m1');
        const m2 = getVal('m2');

        let kS = 1.0;
        if (v1 !== null && v2 !== null && m1 !== null && m2 !== null && v2 !== 0 && m2 !== 0) {
            const vRatioSq = Math.pow((v1 / v2), 2);
            const mRatio = m1 / m2;
            if (vRatioSq - mRatio !== 0) {
                kS = (vRatioSq - 1) / (vRatioSq - mRatio);
                document.getElementById('kS_result').textContent = kS.toFixed(4);
            }
        } else {
            document.getElementById('kS_result').textContent = "---";
        }

        // 4. Calculate Final Dose (Dw)
        const kElec = getVal('kelec') || 1.0;
        const m_raw = getVal('m_raw');
        const ndw = getVal('ndw');
        const kq = getVal('kq');

        if (m_raw !== null && kTP !== 1.0) { // Require at least raw reading and valid kTP
            const m_corr = m_raw * kTP * kElec * kPol * kS;
            document.getElementById('m_corr_result').textContent = m_corr.toFixed(4);

            if (ndw !== null && kq !== null) {
                const dw = m_corr * ndw * kq;
                document.getElementById('dw_result').textContent = dw.toFixed(4);
            } else {
                document.getElementById('dw_result').textContent = "---";
            }
        } else {
            document.getElementById('m_corr_result').textContent = "---";
            document.getElementById('dw_result').textContent = "---";
        }
    }

    // PDF Generation logic using html2pdf
    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
        const element = document.getElementById('worksheet');
        
        const opt = {
            margin:       10,
            filename:     'TRS_398_Worksheet.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Modify styles slightly before generating PDF to remove input borders temporarily
        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.style.border = 'none';
            input.style.borderBottom = '1px solid #333';
            input.style.borderRadius = '0';
        });

        html2pdf().set(opt).from(element).save().then(() => {
            // Restore styles after PDF is generated
            inputs.forEach(input => {
                input.style.border = '';
                input.style.borderBottom = '';
                input.style.borderRadius = '';
            });
        });
    });
});
