const registerForm = document.querySelector('#register-form');
const registerMessage = document.querySelector('#register-message');

if (localStorage.getItem('kikial-token')) {
    window.location.replace('./index.html');
}

registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');
    const submitButton = registerForm.querySelector('button[type="submit"]');

    registerMessage.textContent = '';
    if (password !== confirmPassword) {
        registerMessage.textContent = 'Mật khẩu nhập lại không khớp.';
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Đang tạo tài khoản...';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: formData.get('name'),
                email: formData.get('email'),
                password
            })
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.message);
        localStorage.setItem('kikial-token', result.token);
        window.location.replace('./index.html');
    } catch (error) {
        registerMessage.textContent = error.message || 'Không thể đăng ký. Vui lòng thử lại.';
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Tạo tài khoản <span aria-hidden="true">↗</span>';
    }
});
