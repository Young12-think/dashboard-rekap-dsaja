/* static/js/user_management.js
 * ─────────────────────────────────────────────────────────────
 * User Management Client Logic: fetch list, add, delete, password strength.
 * Khusus untuk Administrator (Role Admin).
 * ───────────────────────────────────────────────────────────── */

// Toast notification helper
function showUserToast(msg, bg = '#bc8cff') {
    const el = document.getElementById('toast');
    const msgEl = document.getElementById('toastMsg');
    if (!el || !msgEl) return;
    
    msgEl.textContent = msg;
    el.style.background = bg;
    el.style.color = '#fff';
    el.classList.add('show');
    
    clearTimeout(window._userToastTimeout);
    window._userToastTimeout = setTimeout(() => {
        el.classList.remove('show');
    }, 3000);
}

// 1. Fetch & Render User List
async function loadUsersList() {
    const tbody = document.getElementById('usersListBody');
    if (!tbody) return;

    try {
        const res = await api('/api/admin/users');
        if (!res || res.status !== 'success') {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger); padding:20px;"><i class="fa-solid fa-circle-exclamation"></i> Gagal memuat data pengguna.</td></tr>`;
            return;
        }

        const users = res.data || [];
        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;"><i class="fa-solid fa-inbox"></i> Tidak ada pengguna terdaftar.</td></tr>`;
            return;
        }

        tbody.innerHTML = users.map((u, idx) => {
            const date = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            
            // Tombol hapus dinonaktifkan untuk admin utama
            const isMainAdmin = u.username === 'admin';
            const deleteBtn = isMainAdmin 
                ? `<button class="btn-delete-user" disabled title="Admin utama tidak bisa dihapus"><i class="fa-solid fa-ban"></i></button>`
                : `<button class="btn-delete-user" onclick="deleteRegisteredUser(${u.id}, '${u.username}')" title="Hapus pengguna"><i class="fa-solid fa-trash"></i></button>`;

            const pwdBtn = `<button class="btn-change-pwd" onclick="openChangePwdModal(${u.id}, '${u.username}')" title="Ganti Password"><i class="fa-solid fa-key"></i></button>`;

            let roleLabel = 'Viewer Standard';
            let roleClass = 'viewer';
            if (u.role === 'admin') {
                roleLabel = 'Admin';
                roleClass = 'admin';
            } else if (u.role === 'viewer_report_only') {
                roleLabel = 'Viewer (Report Only)';
                roleClass = 'viewer';
            }

            return `<tr>
                <td style="text-align:center; font-family:var(--nb-mono); font-weight:600;">${idx + 1}</td>
                <td class="tleft" style="font-weight:700; color:var(--text);">${u.username}</td>
                <td style="text-align:center;">
                    <span class="role-badge ${roleClass}">${roleLabel}</span>
                </td>
                <td style="text-align:center; font-size:0.8rem; color:var(--text-muted);">${date}</td>
                <td style="text-align:center;">
                    <div style="display:flex; gap:6px; justify-content:center;">${pwdBtn}${deleteBtn}</div>
                </td>
            </tr>`;
        }).join('');

    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--danger); padding:20px;"><i class="fa-solid fa-circle-exclamation"></i> Terjadi kesalahan koneksi.</td></tr>`;
    }
}

// 2. Delete User Action
async function deleteRegisteredUser(userId, username) {
    if (!confirm(`Apakah Anda yakin ingin menghapus pengguna "${username}"?\nPengguna ini tidak akan bisa login lagi.`)) {
        return;
    }

    try {
        const res = await fetch(`${API}/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (res.ok && data.status === 'success') {
            showUserToast(`✓ Pengguna "${username}" berhasil dihapus!`, 'var(--danger)');
            loadUsersList();
        } else {
            alert(data.message || 'Gagal menghapus pengguna.');
        }
    } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan saat menghapus pengguna.');
    }
}

// 3. Real-time Password Strength Check
document.addEventListener('DOMContentLoaded', () => {
    const pwdInput = document.getElementById('newPassword');
    const pwdFeedback = document.getElementById('passwordFeedback');
    const pwdStrengthBar = document.getElementById('passwordStrengthBar');
    const pwdStrengthWrap = document.getElementById('passwordStrengthWrap');

    if (!pwdInput) return;

    pwdInput.addEventListener('input', () => {
        const val = pwdInput.value;
        if (!val) {
            pwdStrengthWrap.style.display = 'none';
            return;
        }

        pwdStrengthWrap.style.display = 'block';

        const hasLetter = /[a-zA-Z]/.test(val);
        const hasNumber = /[0-9]/.test(val);

        if (val.length < 6) {
            pwdStrengthBar.style.width = '30%';
            pwdStrengthBar.style.backgroundColor = 'var(--danger, #f85149)';
            pwdFeedback.textContent = 'Terlalu pendek (minimal 6 karakter)';
            pwdFeedback.style.color = 'var(--danger, #f85149)';
        } else if (!hasLetter || !hasNumber) {
            pwdStrengthBar.style.width = '60%';
            pwdStrengthBar.style.backgroundColor = '#f0c000'; // Orange/Yellow
            pwdFeedback.textContent = 'Sedang (butuh kombinasi huruf dan angka)';
            pwdFeedback.style.color = '#f0c000';
        } else {
            pwdStrengthBar.style.width = '100%';
            pwdStrengthBar.style.backgroundColor = 'var(--success, #3fb950)';
            pwdFeedback.textContent = 'Kekuatan: Kuat (kombinasi huruf & angka)';
            pwdFeedback.style.color = 'var(--success, #3fb950)';
        }
    });

    // Form Submission
    const form = document.getElementById('addUserForm');
    const usernameInput = document.getElementById('newUsername');
    const roleSelect = document.getElementById('newRole');
    const btnRegister = document.getElementById('btnRegisterUser');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = (usernameInput.value || '').trim();
        const password = pwdInput.value;
        const role = roleSelect.value;

        // Reset feedbacks
        document.getElementById('usernameFeedback').textContent = '';
        pwdFeedback.textContent = 'Kekuatan password';
        pwdFeedback.style.color = 'var(--text-muted)';

        // A. Validasi Username
        if (username.length < 4) {
            document.getElementById('usernameFeedback').textContent = 'Username minimal 4 karakter.';
            usernameInput.focus();
            return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            document.getElementById('usernameFeedback').textContent = 'Hanya boleh huruf, angka, dan underscore (_).';
            usernameInput.focus();
            return;
        }

        // B. Validasi Password
        if (password.length < 6) {
            pwdFeedback.textContent = 'Password minimal 6 karakter!';
            pwdFeedback.style.color = 'var(--danger, #f85149)';
            pwdInput.focus();
            return;
        }
        if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
            pwdFeedback.textContent = 'Password wajib kombinasi huruf dan angka!';
            pwdFeedback.style.color = 'var(--danger, #f85149)';
            pwdInput.focus();
            return;
        }

        // Jalankan pendaftaran
        btnRegister.disabled = true;
        btnRegister.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mendaftarkan...';

        try {
            const res = await fetch(`${API}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role })
            });
            const data = await res.json();

            btnRegister.disabled = false;
            btnRegister.innerHTML = '<i class="fa-solid fa-user-plus"></i> Daftarkan Pengguna';

            if (res.ok && data.status === 'success') {
                showUserToast(`✓ User "${username}" berhasil didaftarkan!`, 'var(--success)');
                form.reset();
                pwdStrengthWrap.style.display = 'none';
                loadUsersList();
            } else {
                if (data.message && data.message.includes('Username sudah terdaftar')) {
                    document.getElementById('usernameFeedback').textContent = data.message;
                    usernameInput.focus();
                } else {
                    alert(data.message || 'Gagal mendaftarkan user.');
                }
            }
        } catch (err) {
            console.error(err);
            btnRegister.disabled = false;
            btnRegister.innerHTML = '<i class="fa-solid fa-user-plus"></i> Daftarkan Pengguna';
            alert('Koneksi terputus. Silakan coba lagi.');
        }
    });
});

// 4. Change Password Modal
function openChangePwdModal(userId, username) {
    const modal = document.getElementById('changePwdModal');
    if (!modal) return;
    document.getElementById('changePwdUserId').value = userId;
    document.getElementById('changePwdUsername').textContent = username;
    document.getElementById('changePwdInput').value = '';
    document.getElementById('changePwdFeedback').textContent = '';
    document.getElementById('changePwdStrengthBar').style.width = '0%';
    document.getElementById('changePwdStrengthWrap').style.display = 'none';
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('changePwdInput').focus(), 100);
}

function closeChangePwdModal() {
    const modal = document.getElementById('changePwdModal');
    if (modal) modal.style.display = 'none';
}

async function submitChangePassword() {
    const userId = document.getElementById('changePwdUserId').value;
    const newPwd = document.getElementById('changePwdInput').value;
    const feedback = document.getElementById('changePwdFeedback');
    const btn = document.getElementById('btnSubmitChangePwd');

    // Validate
    if (newPwd.length < 6) {
        feedback.textContent = 'Password minimal 6 karakter!';
        feedback.style.color = 'var(--danger, #f85149)';
        return;
    }
    if (!/[a-zA-Z]/.test(newPwd) || !/[0-9]/.test(newPwd)) {
        feedback.textContent = 'Password wajib kombinasi huruf dan angka!';
        feedback.style.color = 'var(--danger, #f85149)';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

    try {
        const res = await fetch(`${API}/api/admin/users/${userId}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: newPwd })
        });
        const data = await res.json();

        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan Password Baru';

        if (res.ok && data.status === 'success') {
            showUserToast(`✓ ${data.message}`, 'var(--success)');
            closeChangePwdModal();
        } else {
            feedback.textContent = data.message || 'Gagal mengubah password.';
            feedback.style.color = 'var(--danger, #f85149)';
        }
    } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Simpan Password Baru';
        feedback.textContent = 'Koneksi terputus. Coba lagi.';
        feedback.style.color = 'var(--danger, #f85149)';
    }
}

// Real-time strength for change password modal
document.addEventListener('DOMContentLoaded', () => {
    // Wait for modal to be rendered
    setTimeout(() => {
        const pwdInput = document.getElementById('changePwdInput');
        if (!pwdInput) return;

        pwdInput.addEventListener('input', () => {
            const val = pwdInput.value;
            const bar = document.getElementById('changePwdStrengthBar');
            const wrap = document.getElementById('changePwdStrengthWrap');
            const fb = document.getElementById('changePwdFeedback');

            if (!val) { wrap.style.display = 'none'; fb.textContent = ''; return; }
            wrap.style.display = 'block';

            const hasLetter = /[a-zA-Z]/.test(val);
            const hasNumber = /[0-9]/.test(val);

            if (val.length < 6) {
                bar.style.width = '30%';
                bar.style.backgroundColor = 'var(--danger, #f85149)';
                fb.textContent = 'Terlalu pendek (minimal 6 karakter)';
                fb.style.color = 'var(--danger, #f85149)';
            } else if (!hasLetter || !hasNumber) {
                bar.style.width = '60%';
                bar.style.backgroundColor = '#f0c000';
                fb.textContent = 'Sedang (butuh kombinasi huruf & angka)';
                fb.style.color = '#f0c000';
            } else {
                bar.style.width = '100%';
                bar.style.backgroundColor = 'var(--success, #3fb950)';
                fb.textContent = 'Kuat ✓';
                fb.style.color = 'var(--success, #3fb950)';
            }
        });
    }, 500);
});
