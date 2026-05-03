document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Setup Logic (Toggle PDD vs TPR labels)
    const setupSelect = document.getElementById('setup');
    const thPdd = document.getElementById('th-pdd');

    function updateSetupLabels() {
        if (setupSelect.value === 'SSD') {
            thPdd.innerHTML = 'PDD (%)';
        } else {
            thPdd.innerHTML = 'TPR';
        }
        calculateAllDoses();
    }
    setupSelect.addEventListener('change', updateSetupLabels);

    // 2. Phantom Material Dropdown Logic
    const phantomSelect = document.getElementById('phantomSelect');
    const phantomOther = document.getElementById('phantomOther');
    phantomSelect.addEventListener('change', () => {
        phantomOther.style.display = phantomSelect.value === 'Other' ? 'block' : 'none';
    });

    // 3. Bi-Directional Sync: Routine M <--> M1
    const mPosInputs = [document.getElementById('m_pos_1'), document.getElementById('m_pos_2'), document.getElementById('m_pos_3')];
    const mNegInputs = [document.getElementById('m_neg_1'), document.getElementById('m_neg_2'), document.getElementById('m_neg_3')];
    const m1Inputs = [document.getElementById('m1_1'), document.getElementById('m1_2'), document.getElementById('m1_3')];
    const routineRadios = document.getElementsByName('routine_polarity');

    function syncRoutineToM1() {
        let activeInputs = document.querySelector('input[name="routine_polarity"]:checked').value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){
            m1Inputs[i].value = activeInputs[i].value;
        }
        calculateAllDoses();
    }

    function syncM1ToRoutine() {
        let activeInputs = document.querySelector('input[name="routine_polarity"]:checked').value === 'pos' ? mPosInputs : mNegInputs;
        for(let i=0; i<3; i++){
            activeInputs[i].value = m1Inputs[i].value;
        }
        calculateAllDoses();
    }

    mPosInputs.forEach(input => input.addEventListener('input', () => {
        if(document.querySelector('input[name="routine_polarity"]:checked').value === 'pos') syncRoutineToM1();
    }));
    mNegInputs.forEach(input => input.addEventListener('input', () => {
        if(document.querySelector('input[name="routine_polarity"]:checked').value === 'neg') syncRoutineToM1();
    }));
    m1Inputs.forEach(input => input.addEventListener('input', syncM1ToRoutine));
    routineRadios.forEach(radio => radio.addEventListener('change', syncRoutineToM1));

    // 4. Attach global calculation triggers
    document.querySelectorAll('.worksheet-section input:not(.row-input), .worksheet-section select:not(.row-input)').forEach(input => {
        input.addEventListener('input', calculateAllDoses);
        input.addEventListener('change', calculateAllDoses);
    });

    // Reference Dose Unit switch updates table headers
    document.getElementById('refDoseUnit').addEventListener('change', () => {
        const unit = document.getElementById('refDoseUnit').value;
        document.getElementById('th-ref-unit').textContent = `[${unit}]`;
        document.getElementById('th-dzmax-unit').textContent = `[${unit}]`;
        calculateAllDoses();
    });

    // Helper: Safely parse floats
    function getVal(id) {
        const val = parseFloat(document.getElementById(id).value);
        return isNaN(val) ? null : val;
    }

    // Helper: Safely parse row inputs
    function getRowVal(inputObj) {
        const val = parseFloat(inputObj.value);
        return isNaN(val) ? null : val;
    }

    function getAverageGlobal(baseId) {
        let v1 = getVal(baseId + '_1'), v2 = getVal(baseId + '_2'), v3 = getVal(baseId + '_3');
        let sum = 0, count = 0;
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
    function calculateAllDoses() {
        // --- (a) Pressure & Temperature ---
        let t0 = getVal('t0'), p0 = getVal('p0'), p0_unit = document.getElementById('p0_unit').value;
        let t_meas = getVal('t_meas'), p_meas = getVal('p_meas'), p_meas_unit = document.getElementById('p_meas_unit').value;

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
        let m_pos_avg = getAverageGlobal('m_pos'), m_neg_avg = getAverageGlobal('m_neg');
        const routineSelected = document.querySelector('input[name="routine_polarity"]:checked').value;
        let m_routine_avg = (routineSelected === 'pos') ? m_pos_avg : m_neg_avg;

        let kPol = 1.0;
        if (m_pos_avg !== null && m_neg_avg !== null && m_routine_avg !== null && m_routine_avg !== 0) {
            kPol = (Math.abs(m_pos_avg) + Math.abs(m_neg_avg)) / (2 * Math.abs(m_routine_avg));
            document.getElementById('kPol_result').textContent = kPol.toFixed(4);
        } else {
            document.getElementById('kPol_result').textContent = "---";
        }

        // --- (c) Recombination Correction (Table 10) ---
        const v1 = getVal('v1'), v2 = getVal('v2');
        let m1_avg = getAverageGlobal('m1'), m2_avg = getAverageGlobal('m2');

        const a_coeffs = {
            "2.0": [2.337, -3.636, 2.299], "2.5": [1.474, -1.587, 1.114],
            "3.0": [1.198, -0.875, 0.677], "3.5": [1.080, -0.542, 0.463],
            "4.0": [1.022, -0.363, 0.341], "5.0": [0.975, -0.188, 0.214]
        };

        let kS = 1.0;
        if (v1 !== null && v2 !== null && v2 !== 0) {
            let ratio = v1 / v2;
            let roundedRatio = (Math.round(ratio * 2) / 2).toFixed(1); 
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
                kS = null; 
            }
        } else {
            document.getElementById('vRatioDisplay').textContent = "--";
            document.getElementById('kS_result').textContent = "---";
        }

        const kElec = getVal('kelec') || 1.0;
        const ndw = getVal('ndw');
        const numMu = getVal('num_mu');
        const refDoseUnit = document.getElementById('refDoseUnit').value;

        // --- Calculate for each row in the Table ---
        const globalFactor = (kTP !== null && kPol !== null && kS !== null) ? (kTP * kElec * kPol * kS) : null;
        const rows = document.querySelectorAll('#doseTable tbody tr');

        rows.forEach(row => {
            const mraw1 = getRowVal(row.querySelector('.inp-mraw1'));
            const mraw2 = getRowVal(row.querySelector('.inp-mraw2'));
            const mraw3 = getRowVal(row.querySelector('.inp-mraw3'));
            const kq = getRowVal(row.querySelector('.inp-kq'));
            const pddTpr = getRowVal(row.querySelector('.inp-pdd'));
            const refDose = getRowVal(row.querySelector('.inp-ref'));

            // Row Mraw Avg
            let sum = 0, count = 0;
            if (mraw1 !== null) { sum += mraw1; count++; }
            if (mraw2 !== null) { sum += mraw2; count++; }
            if (mraw3 !== null) { sum += mraw3; count++; }
            
            let mraw_avg = null;
            if (count > 0) {
                mraw_avg = sum / count;
                row.querySelector('.mraw-avg-display').textContent = mraw_avg.toFixed(4);
            } else {
                row.querySelector('.mraw-avg-display').textContent = "---";
            }

            // M_corr
            let m_corr = null;
            if (mraw_avg !== null && globalFactor !== null) {
                m_corr = mraw_avg * globalFactor;
            }

            // Dose calculations
            let dw_zref = null, dw_zmax = null, comparison_val = null;
            if (m_corr !== null && ndw !== null && kq !== null && numMu !== null && numMu !== 0) {
                dw_zref = (m_corr * ndw * kq) / numMu;

                if (pddTpr !== null && pddTpr !== 0) {
                    if (document.getElementById('setup').value === 'SSD') {
                        dw_zmax = (dw_zref / pddTpr) * 100;
                    } else {
                        dw_zmax = dw_zref / pddTpr;
                    }

                    // Handle display units based on Reference Dose Unit selection strictly as requested
                    if (refDoseUnit === 'cGy/MU') {
                        comparison_val = dw_zmax;
                        row.querySelector('.out-dzmax').textContent = dw_zmax.toFixed(4);
                    } else { // MU/cGy
                        comparison_val = 1 / dw_zmax;
                        row.querySelector('.out-dzmax').textContent = comparison_val.toFixed(4);
                    }
                } else {
                    row.querySelector('.out-dzmax').textContent = "---";
                }
            } else {
                row.querySelector('.out-dzmax').textContent = "---";
            }

            // Variation
            if (comparison_val !== null && refDose !== null && refDose !== 0) {
                const variation = ((comparison_val - refDose) / refDose) * 100;
                const varEl = row.querySelector('.out-var');
                varEl.textContent = variation.toFixed(2);
                varEl.style.color = Math.abs(variation) > 2.0 ? '#d9534f' : '#5cb85c';
            } else {
                row.querySelector('.out-var').textContent = "---";
                row.querySelector('.out-var').style.color = "inherit";
            }
        });
    }

    // Dynamic Row Addition
    function addEnergyRow() {
        const tbody = document.querySelector('#doseTable tbody');
        const tr = document.createElement('tr');
        // We only render outputs for Dzmax and Variation now.
        tr.innerHTML = `
            <td><input type="number" step="1" class="row-input inp-energy"></td>
            <td>
                <div class="mraw-inputs">
                    <input type="number" step="0.01" class="row-input inp-mraw1">
                    <input type="number" step="0.01" class="row-input inp-mraw2">
                    <input type="number" step="0.01" class="row-input inp-mraw3">
                </div>
                <div class="mraw-avg-display">---</div>
            </td>
            <td><input type="number" step="0.01" class="row-input inp-kq"></td>
            <td><input type="number" step="0.01" class="row-input inp-pdd"></td>
            <td><input type="number" step="0.01" class="row-input inp-ref"></td>
            <td class="td-result out-dzmax">---</td>
            <td class="td-result out-var">---</td>
            <td class="no-print"><button class="remove-btn">X</button></td>
        `;
        
        // Add listeners to new inputs
        tr.querySelectorAll('.row-input').forEach(inp => inp.addEventListener('input', calculateAllDoses));
        tr.querySelector('.remove-btn').addEventListener('click', () => {
            tr.remove();
            calculateAllDoses();
        });

        tbody.appendChild(tr);
    }

    document.getElementById('addRowBtn').addEventListener('click', addEnergyRow);

    // Initialize with one empty row
    addEnergyRow();

    // --- PDF Generation Logic ---
    document.getElementById('downloadPdfBtn').addEventListener('click', () => {
        const element = document.getElementById('worksheet');
        
        let unitName = document.getElementById('therapyUnit').value.trim() || 'Unit';
        let dateVal = document.getElementById('date').value || 'Date';
        unitName = unitName.replace(/[^a-z0-9]/gi, '_'); 
        const customFilename = `${unitName}_${dateVal}.pdf`;
        
        const opt = {
            margin:       10,
            filename:     customFilename,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' } // Landscape for table width
        };

        document.body.classList.add('pdf-mode');

        html2pdf().set(opt).from(element).save().then(() => {
            document.body.classList.remove('pdf-mode');
        });
    });
});
