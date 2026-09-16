const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');

if (localStorage.getItem('kikial-token')) {
    window.location.replace('./index.html');
}

loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const submitButton = loginForm.querySelector('button[type="submit"]');

    loginMessage.textContent = '';
    submitButton.disabled = true;
    submitButton.textContent = 'Đang kiểm tra...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: formData.get('email'),
                password: formData.get('password')
            })
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.message);
        localStorage.setItem('kikial-token', result.token);
        window.location.replace('./index.html');
    } catch (error) {
        loginMessage.textContent = error.message || 'Không thể đăng nhập. Vui lòng thử lại.';
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Đăng nhập <span aria-hidden="true">↗</span>';
    }
});
