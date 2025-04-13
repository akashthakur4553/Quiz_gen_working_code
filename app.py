# app.py
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_login import (
    LoginManager,
    UserMixin,
    login_user,
    login_required,
    logout_user,
    current_user,
)
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from pytube import extract
from youtube_transcript_api import YouTubeTranscriptApi
import google.generativeai as genai
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import ast
import os
import logging
import re
from datetime import timedelta, datetime
from flask_login import (
    LoginManager,
    UserMixin,
    login_user,
    login_required,
    logout_user,
    current_user,
)
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from functools import wraps
from flask import g, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
import pytz

# Load environment variables
app = Flask(__name__)
app.config["SECRET_KEY"] = (
    "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"
login_manager.login_message = "Please log in to access this page."
login_manager.login_message_category = "error"

# Database Configuration
basedir = os.path.abspath(os.path.dirname(__file__))
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(basedir, "quiz.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = (
    "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8"
)


# Initialize extensions
db = SQLAlchemy(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"
login_manager.login_message = "Please log in to access this page."
login_manager.login_message_category = "error"


# User Model
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    quizzes = db.relationship(
        "QuizHistory", backref="user", lazy=True, cascade="all, delete-orphan"
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


# Quiz History Model
class QuizHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    video_url = db.Column(db.String(200), nullable=False)
    video_title = db.Column(db.String(200), nullable=False, default="Untitled Video")
    quiz_date = db.Column(db.DateTime, nullable=False)
    last_attempt_date = db.Column(db.DateTime, nullable=False)
    score = db.Column(db.Integer, nullable=False)
    total_questions = db.Column(db.Integer, nullable=False)
    questions = db.Column(db.JSON, nullable=False)
    user_answers = db.Column(db.JSON, nullable=False)
    video_info = db.Column(db.JSON, nullable=False)


# Create database tables
with app.app_context():
    db.create_all()


# Custom login_required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated_function


@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))


# Modified login route
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        data = request.json
        user = User.query.filter_by(username=data["username"]).first()
        if user and user.check_password(data["password"]):
            login_user(user)
            return jsonify({"success": True, "redirect": url_for("index")})
        return jsonify({"error": "Invalid username or password"}), 401
    return render_template("login.html")


# Modified signup route
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        data = request.json
        username = data.get("username")
        email = data.get("email")
        password = data.get("password")

        # Validate password length
        if len(password) < 8:
            return (
                jsonify({"error": "Password must be at least 8 characters long"}),
                400,
            )

        # Check if username exists
        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400

        # Check if email exists
        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already registered"}), 400

        try:
            user = User(username=username, email=email)
            user.set_password(password)
            db.session.add(user)
            db.session.commit()

            login_user(user)
            return jsonify({"success": True, "redirect": url_for("index")})
        except Exception as e:
            db.session.rollback()
            logging.error(f"Error in signup: {str(e)}")
            return jsonify({"error": "An error occurred during signup"}), 500

    return render_template("signup.html")


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for("index"))


logging.basicConfig(level=logging.DEBUG)
genai.configure(api_key="AIzaSyA5tpm4Qk9F6hDI1phk26_-j4Bg58SY8kg")
YOUTUBE_API_KEY = "AIzaSyBFMhQ_8yzbn3A26PtPpmElp6sG57qVzt8"


def convert_duration(duration):
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration)
    hours = int(match.group(1)) if match.group(1) else 0
    minutes = int(match.group(2)) if match.group(2) else 0
    seconds = int(match.group(3)) if match.group(3) else 0
    return timedelta(hours=hours, minutes=minutes, seconds=seconds)


def get_video_details(video_id):
    try:
        youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
        request = youtube.videos().list(part="snippet,contentDetails", id=video_id)
        response = request.execute()

        if not response["items"]:
            raise ValueError("Video not found or is private/unavailable")

        video_data = response["items"][0]
        video_category_id = video_data["snippet"]["categoryId"]
        video_duration = video_data["contentDetails"]["duration"]
        video_language = video_data["snippet"].get("defaultAudioLanguage", "Unknown")
        is_education = video_category_id == "27"
        category_status = "Educational" if is_education else "Not Educational"
        readable_duration = str(convert_duration(video_duration))

        return {
            "Category": category_status,
            "Duration": readable_duration,
            "Language": video_language,
        }
    except HttpError as e:
        if e.resp.status == 403:
            raise Exception("YouTube API quota exceeded. Please try again later.")
        if e.resp.status == 404:
            raise Exception("Video not found. Please check the URL and try again.")
        raise Exception(f"YouTube API error: {str(e)}")
    except Exception as e:
        raise Exception(f"Error fetching video details: {str(e)}")


def get_transcript(video_id):
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join([item["text"] for item in transcript]), True
    except Exception as e:
        raise Exception(
            "This video does not have captions available. Please try a different video."
        )


def generate_questions(transcript, difficulty="medium", n_questions=10):
    try:
        template = f"""
        Generate exactly {n_questions} multiple choice questions based on this text. 
        Each question must have exactly one correct answer and two wrong answers.
        Make the questions {difficulty} difficulty.
        
        Format your response as a Python list of lists, where each sublist contains:
        [question_text, correct_answer, wrong_answer1, wrong_answer2]

        Example format:
        [
            ["What is the capital of France?", "Paris", "London", "Berlin"],
            ["What is 2+2?", "4", "3", "5"]
        ]

        Important:
        - Each question must be clear and specific
        - Answers should be concise
        - Do not include explanations or additional text
        - Ensure all answers are different from each other
        - Return ONLY the list, no other text

        Here is the text to generate questions from:
        {transcript[:5000]}  # Limit text length to avoid token limits
        """

        model = genai.GenerativeModel("gemini-1.5-pro")
        response = model.generate_content(template)

        # Clean the response text
        response_text = response.text.strip()
        # Remove any markdown code block indicators
        response_text = re.sub(
            r"^```python\s*|```\s*$", "", response_text, flags=re.MULTILINE
        )

        try:
            questions = ast.literal_eval(response_text)
        except (SyntaxError, ValueError) as e:
            logging.error(f"Failed to parse model response: {response_text}")
            raise Exception("Failed to generate valid questions. Please try again.")

        # Validate response format
        if not isinstance(questions, list):
            raise Exception("Invalid response format: not a list")

        if len(questions) < n_questions:
            raise Exception(
                f"Only generated {len(questions)} questions instead of {n_questions}"
            )

        # Validate each question
        for i, q in enumerate(questions):
            if not isinstance(q, list) or len(q) != 4:
                raise Exception(f"Invalid question format at index {i}")
            if not all(isinstance(x, str) for x in q):
                raise Exception(f"Invalid answer format at index {i}")
            if len(set(q[1:])) != 3:  # Check if all answers are unique
                raise Exception(f"Duplicate answers in question {i}")

        return questions[:n_questions]  # Ensure we return exactly n_questions

    except Exception as e:
        logging.error(f"Error in generate_questions: {str(e)}")
        raise Exception(f"Error generating questions: {str(e)}")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/generate_quiz", methods=["POST"])
@login_required
def generate_quiz():
    try:
        video_url = request.json["video_url"]
        question_count = request.json.get("question_count", 10)
        difficulty = request.json.get("difficulty", "medium")

        if not video_url:
            return jsonify({"error": "Please provide a YouTube URL"}), 400

        # Check for recent attempts
        ist = pytz.timezone("Asia/Kolkata")
        now = datetime.now(ist)
        one_day_ago = now - timedelta(days=1)
        three_days_ago = now - timedelta(days=3)

        # Get user's attempts for this video URL
        recent_attempts = (
            QuizHistory.query.filter(
                QuizHistory.user_id == current_user.id,
                QuizHistory.video_url == video_url,
                QuizHistory.quiz_date >= three_days_ago,
            )
            .order_by(QuizHistory.quiz_date.desc())
            .all()
        )

        if recent_attempts:
            # Check if there are 2 or more attempts in the last day
            attempts_in_last_day = sum(
                1
                for attempt in recent_attempts
                if attempt.quiz_date.replace(tzinfo=ist) >= one_day_ago
            )

            if attempts_in_last_day >= 2:
                # Find the earliest attempt in the last 3 days
                earliest_attempt = recent_attempts[-1]
                next_allowed_date = earliest_attempt.quiz_date.replace(
                    tzinfo=ist
                ) + timedelta(days=3)
                return (
                    jsonify(
                        {
                            "error": f"You have reached the maximum number of attempts for this video today. You can try again after {next_allowed_date.strftime('%B %d, %Y at %I:%M %p')}"
                        }
                    ),
                    429,
                )

        try:
            video_id = extract.video_id(video_url)
        except Exception:
            return (
                jsonify(
                    {"error": "Invalid YouTube URL. Please check the URL and try again"}
                ),
                400,
            )

        video_info = get_video_details(video_id)

        if not video_info:
            return jsonify({"error": "Invalid video ID or video not found"}), 400

        if video_info["Category"] != "Educational":
            return (
                jsonify(
                    {
                        "error": "This video is not in the educational category. Please use an educational video"
                    }
                ),
                400,
            )

        if video_info["Language"] != "en":
            return (
                jsonify(
                    {
                        "error": "This video is not in English. Please use an English video"
                    }
                ),
                400,
            )

        transcript, captions_available = get_transcript(video_id)
        questions = generate_questions(transcript, difficulty, question_count)
        video_info["Captions"] = captions_available

        return jsonify({"video_info": video_info, "questions": questions})

    except Exception as e:
        logging.error(f"Error in generate_quiz: {str(e)}")
        return jsonify({"error": str(e)}), 400


@app.route("/save_quiz", methods=["POST"])
@login_required
def save_quiz():
    try:
        data = request.json
        # Use IST timezone
        ist = pytz.timezone("Asia/Kolkata")
        current_time = datetime.now(ist)

        # Get video title with fallback
        video_title = data["video_info"].get("Title", "Untitled Video")

        quiz_history = QuizHistory(
            user_id=current_user.id,
            video_url=data["video_url"],
            video_title=video_title,
            quiz_date=current_time,
            last_attempt_date=current_time,
            score=data["score"],
            total_questions=data["total_questions"],
            questions=data["questions"],
            user_answers=data["user_answers"],
            video_info=data["video_info"],
        )
        db.session.add(quiz_history)
        db.session.commit()
        return jsonify({"message": "Quiz saved successfully"})
    except Exception as e:
        logging.error(f"Error saving quiz: {str(e)}")
        db.session.rollback()
        return jsonify({"error": "Failed to save quiz results"}), 500


@app.route("/quiz_history")
@login_required
def quiz_history():
    try:
        # Get only the current user's quiz history, ordered by date (newest first)
        history = (
            QuizHistory.query.filter_by(user_id=current_user.id)
            .order_by(QuizHistory.quiz_date.desc())
            .all()
        )

        # Add error handling for missing video titles
        for quiz in history:
            if not hasattr(quiz, "video_title") or not quiz.video_title:
                quiz.video_title = quiz.video_info.get("Title", "Untitled Video")

        return render_template("history.html", history=history)
    except Exception as e:
        logging.error(f"Error fetching quiz history: {str(e)}")
        return render_template(
            "history.html", history=[], error="Failed to load quiz history"
        )


if __name__ == "__main__":
    app.run(debug=True)
