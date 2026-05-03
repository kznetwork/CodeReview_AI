# Digit Recognizer

A simple handwritten digit recognition application using PyTorch and Gradio.

## Features
- **CNN Model**: A Convolutional Neural Network trained on the MNIST dataset.
- **Interactive UI**: Draw digits on a web-based canvas and get instant predictions.
- **Auto-Setup**: The application automatically downloads the dataset and trains the model if weights are missing.

## Installation
1. Ensure you have Python 3.8+ installed.
2. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage
Run the application:
```bash
python app.py
```
Then open your browser to the local URL provided (typically `http://127.0.0.1:7860`).

## File Structure
- `app.py`: Main application code (Model + Gradio UI).
- `mnist_cnn.pt`: Saved model weights.
- `requirements.txt`: Python package requirements.
- `data/`: Directory for the MNIST dataset.
- `test_model.py`: Basic unit tests for the model architecture.
