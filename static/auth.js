document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const errorDisplay = document.getElementById('error-display');

    function showError(message) {
        errorDisplay.textContent = message;
        errorDisplay.classList.remove('hidden');
    }

    function validatePassword(password) {
        if (password.length < 8) {
            return 'Password must be at least 8 characters long';
        }
        return null;
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            // Password validation
            const passwordError = validatePassword(password);
            if (passwordError) {
                showError(passwordError);
                return;
            }

            try {
                const response = await fetch('/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    window.location.href = data.redirect;
                } else {
                    showError(data.error);
                }
            } catch (error) {
                showError('An error occurred. Please try again.');
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    window.location.href = data.redirect;
                } else {
                    showError(data.error);
                }
            } catch (error) {
                showError('An error occurred. Please try again.');
            }
        });
    }
}); 