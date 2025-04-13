document.addEventListener('DOMContentLoaded', function () {
    const generateBtn = document.getElementById('generate-btn');
    const videoUrlInput = document.getElementById('video-url');
    const difficultySelect = document.getElementById('difficulty');
    const errorBanner = document.getElementById('error-banner');
    const quizContainer = document.getElementById('quiz-container');
    const questionCountSlider = document.getElementById('question-count');
    const questionCountValue = document.getElementById('question-count-value');

    if (questionCountSlider) {
        questionCountSlider.addEventListener('input', function () {
            questionCountValue.textContent = this.value;

            // Update the background gradient
            const value = (this.value - this.min) / (this.max - this.min) * 100;
            this.style.background = `linear-gradient(to right, 
                var(--primary-color) 0%, 
                var(--primary-color) ${value}%, 
                rgba(255, 255, 255, 0.1) ${value}%, 
                rgba(255, 255, 255, 0.1) 100%)`;
        });

        // Initialize the slider color
        questionCountSlider.dispatchEvent(new Event('input'));
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', async function () {
            const videoUrl = videoUrlInput.value.trim();
            const difficulty = difficultySelect.value;

            if (!videoUrl) {
                showError('Please enter a YouTube URL');
                return;
            }

            // Show loading state
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';
            errorBanner.classList.add('hidden');

            try {
                const response = await fetch('/generate_quiz', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        video_url: videoUrl,
                        difficulty: difficulty,
                        question_count: parseInt(questionCountSlider.value)
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to generate quiz');
                }

                displayQuiz(data);
            } catch (error) {
                showError(error.message);
            } finally {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Quiz';
            }
        });
    }

    function showError(message) {
        errorBanner.textContent = message;
        errorBanner.classList.remove('hidden');
        errorBanner.classList.add('error-message');
    }

    let currentQuizQuestions = [];
    let currentVideoInfo = null;

    function displayQuiz(data) {
        // Store the current quiz data
        currentVideoInfo = data.video_info;
        currentQuizQuestions = data.questions.map((q, index) => ({
            question_text: q[0],
            correct_answer: q[1],
            options: [q[1], q[2], q[3]].sort(() => Math.random() - 0.5)
        }));

        // Clear previous quiz
        quizContainer.innerHTML = '';

        // Display video info
        const videoInfoHTML = `
            <div class="video-info-container">
                <h3>Video Information</h3>
                <div class="video-info-grid">
                    <div class="video-info-item">
                        <p>Category</p>
                        <p>${data.video_info.Category}</p>
                    </div>
                    <div class="video-info-item">
                        <p>Duration</p>
                        <p>${data.video_info.Duration}</p>
                    </div>
                    <div class="video-info-item">
                        <p>Language</p>
                        <p>${data.video_info.Language}</p>
                    </div>
                </div>
            </div>
        `;
        quizContainer.innerHTML = videoInfoHTML;

        // Display questions
        const questionsContainer = document.createElement('div');
        questionsContainer.className = 'questions-container';

        data.questions.forEach((question, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question-card';

            const options = [
                { text: question[1], correct: true },
                { text: question[2], correct: false },
                { text: question[3], correct: false }
            ].sort(() => Math.random() - 0.5);

            questionDiv.innerHTML = `
                <p class="question-text">${index + 1}. ${question[0]}</p>
                <div class="options">
                    ${options.map((option, i) => `
                        <label class="option">
                            <input type="radio" name="question${index}" value="${i}" data-correct="${option.correct}">
                            ${option.text}
                        </label>
                    `).join('')}
                </div>
            `;
            questionsContainer.appendChild(questionDiv);
        });

        quizContainer.appendChild(questionsContainer);

        // Add submit button in a container
        const submitContainer = document.createElement('div');
        submitContainer.className = 'submit-container';

        const submitBtn = document.createElement('button');
        submitBtn.className = 'submit-btn';
        submitBtn.textContent = 'Submit Quiz';
        submitBtn.onclick = function () {
            checkAnswers();
            submitBtn.disabled = true;
            submitBtn.textContent = 'Quiz Submitted';
        };

        submitContainer.appendChild(submitBtn);
        quizContainer.appendChild(submitContainer);
    }

    function checkAnswers() {
        let score = 0;
        let total = 0;
        const questions = document.querySelectorAll('.question-card');
        const userAnswers = {};

        questions.forEach((question, index) => {
            total++;
            const selectedOption = question.querySelector('input[type="radio"]:checked');
            const questionText = question.querySelector('.question-text').textContent.slice(3); // Remove the question number

            if (selectedOption) {
                const selectedAnswer = selectedOption.parentElement.textContent.trim();
                userAnswers[questionText] = selectedAnswer;

                if (selectedOption.dataset.correct === 'true') {
                    score++;
                    question.classList.add('correct');
                } else {
                    question.classList.add('incorrect');
                }
            } else {
                // Handle unanswered question
                userAnswers[questionText] = 'unanswered';
                question.classList.add('unanswered');
            }

            // Disable inputs after submission
            question.querySelectorAll('input[type="radio"]').forEach(input => {
                input.disabled = true;
            });
        });

        // Save quiz results
        saveQuizResults(score, total, userAnswers);

        // Display score
        const scoreDisplay = document.createElement('div');
        scoreDisplay.className = 'score-display';
        scoreDisplay.textContent = `Score: ${score}/${total}`;
        quizContainer.insertBefore(scoreDisplay, document.querySelector('.submit-container'));
    }

    async function saveQuizResults(score, total, userAnswers) {
        try {
            const response = await fetch('/save_quiz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    video_url: videoUrlInput.value,
                    score: score,
                    total_questions: total,
                    questions: currentQuizQuestions,
                    user_answers: userAnswers,
                    video_info: currentVideoInfo
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save quiz results');
            }
        } catch (error) {
            console.error('Error saving quiz:', error);
        }
    }
}); 