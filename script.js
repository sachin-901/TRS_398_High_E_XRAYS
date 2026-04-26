document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Phantom Material Dropdown Logic
    const phantomSelect = document.getElementById('phantomSelect');
    const phantomOther = document.getElementById('phantomOther');
    phantomSelect.addEventListener('change', () => {
        phantomOther.style.display = phantomSelect.value === 'Other' ? 'block' : 'none';
    });

    // 2. Attach calculation triggers to all inputs
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('input', calculateDose);
        input.addEventListener('change', calculateDose);
    });

    // Helper: Safely parse floats
    function getVal(id) {
        const val = parseFloat(document.getElementById(id).value);
        return isNaN(val) ? null : val;
    }

    // Helper: Calculate average from 3 inputs
    function getAverage(baseId) {
        let v1 = getVal(baseId + '_1');
        let v2 = getVal(baseId + '_2');
        let v3 = getVal(baseId + '_3');
        
        let sum = 0;
        let count = 0;
        if (v1 !== null) { sum += v1; count++; }
        if (v2 !== null) { sum += v2; count++; }
        if (v3 !== null) { sum += v3; count++; }

        if (count === 0) {
            document.getElementById(baseId + '_avg').textContent = "---";
            return null;
        }

        let avg = sum / count;
        document.getElementById(baseId + '_avg').textContent = avg.toFixed(4);
        return avg;
    }

    // Main calculation routine
    function calculateDose() {
        // --- (a) Pressure & Temperature ---
        let t0 = getVal('t0');
        let p0 = getVal('p0');
        let p0_unit = document.getElementById('p0_unit').value;
        
        let t_meas = getVal('t_meas');
        let p_meas = getVal('p_meas');
        let p_meas_unit = document.getElementById('p_meas_unit').value;

        // Convert mbar to kPa for consistent math (10 mbar = 1 kPa)
        if (p0 !== null && p0_unit === 'mbar') p0 = p0 / 10;
        if (p_meas !== null && p_meas_unit === 'mbar') p_meas = p_meas / 10;

        let kTP = 1.0;
        if (t0 !== null && p0 !== null && t_meas !== null && p_meas !== null && p_meas !== 0) {
            kTP = ((273.15 + t_meas) / (273.15 + t0)) * (p0 / p_meas);
            document.getElementById('kTP_result').textContent = kTP.toFixed(4);
        } else {
            document.getElementById('kTP_result').textContent = "---";
        }

        // --- (b) Polarity Correction ---
        let m_pos_avg = getAverage('m_pos');
        let m_neg_avg = getAverage('m_neg');
        let m_raw_avg = getAverage('m_raw'); // Routine M used for Dose

        let kPol = 1.0;
        if (m_pos_avg !== null && m_neg_avg !== null && m_raw_avg !== null && m_raw_avg !== 0) {
            kPol = (Math.abs(m_pos_avg) + Math.abs(m_neg_avg)) / (2 * Math.abs(m_raw_avg));
            document.getElementById('kPol_result').textContent = kPol.toFixed(4);
        } else {
            document.getElementById('kPol_result').textContent = "---";
        }

        // --- (c) Recombination Correction (Two-Voltage, Table 10) ---
        const v1 = getVal('v1');
        const v2 = getVal('v2');
        let m1_avg = getAverage('m1');
        let m2_avg = getAverage('m2');

        const a_coeffs = {
            2.0: [2.337, -3.636, 2.299],
            2.5: [1.474, -1.587, 1.114],
            3.0: [1.198, -0.875, 0.677],
            3.5: [1.080, -0.542, 0.463],
            4.0: [1.022, -0.363, 0.341],
            5.0: [0.975, -0.188, 0.214]
        };

        let kS = 1.0;
        if (v1 !== null && v2 !== null && v2 !== 0) {
            let ratio = v1 / v2;
            let roundedRatio = (Math.round(ratio * 2) / 2).toFixed(1); // Round to nearest 0.5 step
            
            document.getElementById('vRatioDisplay').textContent = ratio.toFixed(2);

            let coeffs = a_coeffs[roundedRatio];
            if (coeffs) {
                document.getElementById('a0_val').textContent = coeffs[0];
                document.getElementById('a1_val').textContent = coeffs[1];
                document.getElementById('a2_val').textContent = coeffs[2];

                if (m1_avg !== null && m2_avg !== null && m2_avg !== 0) {
                    let mRatio = m1_avg / m2_avg;
                    kS = coeffs[0] + (coeffs[1] * mRatio) + (coeffs[2] * Math.pow(mRatio, 2));
                    document.getElementById('kS_result').textContent = kS.toFixed(4);
                } else {
                    document.getElementById('kS_result').textContent = "---";
                }
            } else {
                document.getElementById('a0_val').textContent = "N/A";
                document.getElementById('a1_val').textContent = "N/A";
                document.getElementById('a2_val').textContent = "N/A";
                document.getElementById('kS_result').textContent = "Ratio out of bounds (Use 2.0 to 5.0)";
                kS = null; // Prevent final calculation
            }
        } else {
            document.getElementById('vRatioDisplay').textContent = "--";
            document.getElementById('kS_result').textContent = "---";
        }

        // --- 4. Final Dose (Dw) ---
        const kElec = getVal('kelec') || 1.0;
        const ndw = getVal('ndw');
        const kq = getVal('kq');

        if (m_raw_avg !== null && kTP !== 1.0 && kS !== null && typeof kS === 'number') { 
            const m_corr = m_raw_avg * kTP * kElec * kPol * kS;
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

    // --- PDF Generation Logic ---
    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
        const element = document.getElementById('worksheet');
        
        // Generate dynamic filename
        let unitName = document.getElementById('therapyUnit').value.trim() || 'Unit';
        let dateVal = document.getElementById('date').value || 'Date';
        unitName = unitName.replace(/[^a-z0-9]/gi, '_'); // Remove special chars for safe filename
        const customFilename = `${unitName}_${dateVal}.pdf`;
        
        const opt = {
            margin:       10,
            filename:     customFilename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Add a temporary class to the body to trigger our CSS @media print rules directly for html2pdf
        document.body.classList.add('pdf-mode');

        html2pdf().set(opt).from(element).save().then(() => {
            document.body.classList.remove('pdf-mode');
        });
    });
});
