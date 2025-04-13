// script.js
document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const videoUrlInput = document.getElementById('video-url');
    const quizContainer = document.getElementById('quiz-container');
    const questionsContainer = document.getElementById('questions-container');
    const submitQuizBtn = document.getElementById('submit-quiz');
    const resultsContainer = document.getElementById('results-container');
    const scoreDisplay = document.getElementById('score-display');
    const loadingIndicator = document.getElementById('loading-indicator');
    const questionCountSlider = document.getElementById('question-count');
    const questionCountDisplay = document.getElementById('question-count-display');
    const difficultySelect = document.getElementById('difficulty');
    const videoInfo = document.getElementById('video-info');
    const errorBanner = document.getElementById('error-banner');

    let quizData = [];
    let currentError = null;
    let errorTimeout = null;

    function validateYouTubeUrl(url) {
        const regExp = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        return regExp.test(url);
    }

    function showError(message) {
        if (errorTimeout) {
            clearTimeout(errorTimeout);
        }

        errorBanner.textContent = message;
        errorBanner.classList.remove('hidden');
        errorBanner.classList.add('error-shake');
        currentError = message;

        // Remove shake animation after it completes
        setTimeout(() => {
            errorBanner.classList.remove('error-shake');
        }, 1000);

        // Hide quiz container and results if there's an error
        quizContainer.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        videoInfo.classList.add('hidden');
    }

    function hideError() {
        errorBanner.classList.add('hidden');
        currentError = null;
        if (errorTimeout) {
            clearTimeout(errorTimeout);
            errorTimeout = null;
        }
    }

    videoUrlInput.addEventListener('input', () => {
        const url = videoUrlInput.value.trim();
        if (currentError && validateYouTubeUrl(url)) {
            hideError();
        }
    });

    questionCountSlider.addEventListener('input', () => {
        questionCountDisplay.textContent = questionCountSlider.value;
    });

    generateBtn.addEventListener('click', async () => {
        const videoUrl = videoUrlInput.value.trim();

        if (!videoUrl) {
            showError('Please enter a YouTube URL');
            return;
        }

        if (!validateYouTubeUrl(videoUrl)) {
            showError('Please enter a valid YouTube URL');
            return;
        }

        try {
            hideError();
            showLoading(true);

            const response = await fetch('/generate_quiz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    video_url: videoUrl,
                    question_count: parseInt(questionCountSlider.value),
                    difficulty: difficultySelect.value
                }),
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Failed to generate quiz');
            }

            displayVideoInfo(data.video_info);
            quizData = data.questions;

            if (quizData.length === 0) {
                throw new Error('No questions were generated. The video might be too short or lack sufficient content.');
            }

            renderQuiz(quizData);
            quizContainer.classList.remove('hidden');

            // Scroll to quiz
            quizContainer.scrollIntoView({ behavior: 'smooth' });

        } catch (error) {
            showError(error.message);
        } finally {
            showLoading(false);
        }
    });

    function displayVideoInfo(info) {
        document.getElementById('video-category').textContent = `Category: ${info.Category}`;
        document.getElementById('video-language').textContent = `Language: ${info.Language}`;
        document.getElementById('video-duration').textContent = `Duration: ${info.Duration}`;
        document.getElementById('video-captions').textContent = `Captions: ${info.Captions ? 'Available' : 'Not available'}`;
        videoInfo.classList.remove('hidden');
    }

    function renderQuiz(questions) {
        questionsContainer.innerHTML = '';
        questions.forEach((question, index) => {
            const questionCard = document.createElement('div');
            questionCard.classList.add('question-card', 'mb-4', 'p-4', 'bg-white', 'rounded', 'shadow');

            const questionText = document.createElement('p');
            questionText.classList.add('question-text', 'font-bold', 'mb-2');
            questionText.textContent = `${index + 1}. ${question[0]}`;

            const options = document.createElement('div');
            options.classList.add('options');

            const shuffledOptions = shuffleArray([...question.slice(1)]);

            shuffledOptions.forEach((option, optionIndex) => {
                const label = document.createElement('label');
                label.classList.add('block', 'mb-2', 'option-label');

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = `question-${index}`;
                radio.value = option;
                radio.id = `q${index}-option${optionIndex}`;
                radio.classList.add('mr-2');

                label.appendChild(radio);
                label.appendChild(document.createTextNode(option));
                options.appendChild(label);
            });

            questionCard.appendChild(questionText);
            questionCard.appendChild(options);
            questionsContainer.appendChild(questionCard);
        });

        submitQuizBtn.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    submitQuizBtn.addEventListener('click', () => {
        let score = 0;
        let unansweredQuestions = 0;

        quizData.forEach((question, index) => {
            const selectedOption = document.querySelector(`input[name="question-${index}"]:checked`);
            const questionCard = document.querySelectorAll('.question-card')[index];
            const options = questionCard.querySelectorAll('.option-label');

            if (selectedOption) {
                if (selectedOption.value === question[1]) {
                    score++;
                    questionCard.classList.add('bg-green-100');
                } else {
                    questionCard.classList.add('bg-red-100');
                }

                // Highlight correct and incorrect answers
                options.forEach(option => {
                    const radio = option.querySelector('input');
                    if (radio.value === question[1]) {
                        option.classList.add('correct-answer');
                    } else if (radio.value === selectedOption.value && radio.value !== question[1]) {
                        option.classList.add('incorrect-answer');
                    }
                });
            } else {
                unansweredQuestions++;
                questionCard.classList.add('bg-yellow-100');

                // Highlight correct answer for unanswered questions
                options.forEach(option => {
                    const radio = option.querySelector('input');
                    if (radio.value === question[1]) {
                        option.classList.add('correct-answer');
                    }
                });
            }

            // Disable radio buttons after submission
            questionCard.querySelectorAll('input[type="radio"]').forEach(radio => {
                radio.disabled = true;
            });
        });

        const totalQuestions = quizData.length;
        const answeredQuestions = totalQuestions - unansweredQuestions;
        const percentage = Math.round((score / totalQuestions) * 100);

        let resultMessage = `<div class="text-2xl font-bold mb-4">Your Score: ${score} out of ${totalQuestions} (${percentage}%)</div>`;
        resultMessage += `<div class="mb-2">Questions answered: ${answeredQuestions} out of ${totalQuestions}</div>`;
        if (unansweredQuestions > 0) {
            resultMessage += `<div class="text-yellow-600">Unanswered questions: ${unansweredQuestions}</div>`;
        }

        scoreDisplay.innerHTML = resultMessage;
        resultsContainer.classList.remove('hidden');
        submitQuizBtn.classList.add('hidden');

        // Scroll to results
        resultsContainer.scrollIntoView({ behavior: 'smooth' });
    });

    function showLoading(isLoading) {
        if (isLoading) {
            loadingIndicator.classList.remove('hidden');
            generateBtn.disabled = true;
            generateBtn.textContent = 'Generating...';
            videoInfo.classList.add('hidden');
        } else {
            loadingIndicator.classList.add('hidden');
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Quiz';
        }
    }
});