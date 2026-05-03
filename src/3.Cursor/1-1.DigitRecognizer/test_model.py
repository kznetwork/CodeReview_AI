import torch
import unittest
from app import Net

class TestDigitModel(unittest.TestCase):
    def setUp(self):
        self.model = Net()
        self.model.eval()

    def test_output_shape(self):
        # Test with a single 28x28 grayscale image (batch size 1)
        dummy_input = torch.randn(1, 1, 28, 28)
        output = self.model(dummy_input)
        self.assertEqual(output.shape, (1, 10), "Output shape should be (batch_size, 10)")

    def test_forward_pass(self):
        dummy_input = torch.randn(2, 1, 28, 28)
        output = self.model(dummy_input)
        # Check if values are log-probabilities (should be <= 0)
        self.assertTrue(torch.all(output <= 0.0001))

if __name__ == '__main__':
    unittest.main()
