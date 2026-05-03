import os
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from torchvision import datasets, transforms
from PIL import Image
import numpy as np
import gradio as gr

# 1. Define the CNN Model
class Net(nn.Module):
    def __init__(self):
        super(Net, self).__init__()
        self.conv1 = nn.Conv2d(1, 32, 3, 1)
        self.conv2 = nn.Conv2d(32, 64, 3, 1)
        self.dropout1 = nn.Dropout(0.25)
        self.dropout2 = nn.Dropout(0.5)
        self.fc1 = nn.Linear(9216, 128)
        self.fc2 = nn.Linear(128, 10)

    def forward(self, x):
        x = self.conv1(x)
        x = F.relu(x)
        x = self.conv2(x)
        x = F.relu(x)
        x = F.max_pool2d(x, 2)
        x = self.dropout1(x)
        x = torch.flatten(x, 1)
        x = self.fc1(x)
        x = F.relu(x)
        x = self.dropout2(x)
        x = self.fc2(x)
        output = F.log_softmax(x, dim=1)
        return output

# 2. Training Logic (Simplified for quick setup)
def train_model(model, device, train_loader, optimizer, epoch):
    model.train()
    for batch_idx, (data, target) in enumerate(train_loader):
        data, target = data.to(device), target.to(device)
        optimizer.zero_grad()
        output = model(data)
        loss = F.nll_loss(output, target)
        loss.backward()
        optimizer.step()
        if batch_idx % 100 == 0:
            print(f'Train Epoch: {epoch} [{batch_idx * len(data)}/{len(train_loader.dataset)} '
                  f'({100. * batch_idx / len(train_loader):.0f}%)]\tLoss: {loss.item():.6f}')

def setup_model():
    device = torch.device("cpu")
    model = Net().to(device)
    weight_path = "mnist_cnn.pt"

    if os.path.exists(weight_path):
        print("Loading pre-trained weights...")
        model.load_state_dict(torch.load(weight_path, map_location=device))
    else:
        print("No weights found. Training a new model (this will take a moment)...")
        transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize((0.1307,), (0.3081,))
        ])
        train_dataset = datasets.MNIST('./data', train=True, download=True, transform=transform)
        train_loader = torch.utils.data.DataLoader(train_dataset, batch_size=64, shuffle=True)
        
        optimizer = optim.Adadelta(model.parameters(), lr=1.0)
        
        # Train for 1 epoch for quick demonstration
        train_model(model, device, train_loader, optimizer, 1)
        torch.save(model.state_dict(), weight_path)
        print("Training complete and weights saved.")
    
    model.eval()
    return model

# Initialize model
model = setup_model()

# 3. Prediction Function for Gradio
def predict(input_image):
    if input_image is None:
        return None, None
    
    # Preprocessing the Gradio Sketchpad input
    img = input_image['composite']
    
    # Convert to PIL Image
    img = Image.fromarray(img.astype('uint8'), 'RGBA')
    
    # Extract Alpha channel or convert to grayscale
    img = img.convert('L') 
    
    # Resize to 28x28 (MNIST size)
    img = img.resize((28, 28), Image.Resampling.LANCZOS)
    
    # Convert to numpy and normalize
    img_array = np.array(img)
    
    # Invert if necessary (MNIST is white digits on black background)
    if np.mean(img_array) > 127:
        img_array = 255 - img_array
        
    img_tensor = transforms.ToTensor()(img_array)
    img_tensor = transforms.Normalize((0.1307,), (0.3081,))(img_tensor)
    img_tensor = img_tensor.unsqueeze(0) # Add batch dimension
    
    with torch.no_grad():
        output = model(img_tensor)
        probabilities = torch.exp(output)
        top_probs, top_indices = torch.topk(probabilities, 3)
        
    results = {str(top_indices[0][i].item()): float(top_probs[0][i]) for i in range(3)}
    
    # Return results and the preprocessed image for preview
    return results, img_array

# 4. Gradio Interface
interface = gr.Interface(
    fn=predict,
    inputs=gr.Sketchpad(label="Draw a digit (0-9)", type="numpy"),
    outputs=[
        gr.Label(num_top_classes=3, label="Predictions"),
        gr.Image(label="What the model sees (28x28)", image_mode="L")
    ],
    title="Handwritten Digit Recognizer",
    description="Draw a single digit (0-9) on the canvas below. You can see the model's prediction and the 28x28 processed image used for inference.",
)

if __name__ == "__main__":
    # In Gradio 6.0+, theme is passed to launch()
    interface.launch(theme="soft")
