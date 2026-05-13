// Mock localStorage
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Mock FileReader
global.FileReader = jest.fn(() => ({
  readAsText: jest.fn(),
  readAsBinaryString: jest.fn(),
  addEventListener: jest.fn(),
  result: null,
}));