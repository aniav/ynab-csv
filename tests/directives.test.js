// Mock AngularJS
const mockModule = {
  directive: jest.fn(() => mockModule),
  config: jest.fn(() => mockModule),
  controller: jest.fn(() => mockModule)
};

global.angular = {
  element: jest.fn(() => ({
    ready: jest.fn((callback) => callback())
  })),
  module: jest.fn(() => mockModule),
  bootstrap: jest.fn()
};

describe('AngularJS Directives', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    // Load the app.js file to register the directives
    require('../src/app.js');
  });

  describe('fileread directive', () => {
    let directiveFactory;
    let mockElement;
    let mockScope;
    let mockAttributes;

    beforeEach(() => {
      // Get the fileread directive factory
      const directiveCalls = mockModule.directive.mock.calls;
      const filereadCall = directiveCalls.find(call => call[0] === 'fileread');
      // The directive is defined as an array with the function as the last element
      directiveFactory = filereadCall[1][0];

      // Create mocks
      mockScope = {
        fileread: null,
        $apply: jest.fn((fn) => fn && fn())
      };
      
      mockElement = {
        bind: jest.fn()
      };
      
      mockAttributes = {
        encoding: 'UTF-8'
      };
    });

    test('should register fileread directive', () => {
      expect(directiveFactory).toBeDefined();
      expect(typeof directiveFactory).toBe('function');
    });

    test('should configure directive with correct scope', () => {
      const directiveConfig = directiveFactory();
      
      expect(directiveConfig.scope).toEqual({
        fileread: "="
      });
    });

    test('should bind change event to element', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      expect(mockElement.bind).toHaveBeenCalledWith('change', expect.any(Function));
    });

    test('should process file when change event occurs', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      // Get the change event handler
      const changeHandler = mockElement.bind.mock.calls[0][1];
      
      // Mock FileReader
      const mockReader = {
        onload: null,
        readAsText: jest.fn()
      };
      global.FileReader = jest.fn(() => mockReader);
      
      // Mock event
      const mockEvent = {
        target: {
          files: [{ name: 'test.csv', size: 100 }]
        }
      };
      
      // Execute change handler
      changeHandler(mockEvent);
      
      expect(global.FileReader).toHaveBeenCalled();
      expect(mockReader.readAsText).toHaveBeenCalledWith(mockEvent.target.files[0], 'UTF-8');
    });

    test('should update scope when file is loaded', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      const changeHandler = mockElement.bind.mock.calls[0][1];
      
      const mockReader = {
        onload: null,
        readAsText: jest.fn()
      };
      global.FileReader = jest.fn(() => mockReader);
      
      const mockEvent = {
        target: { files: [{ name: 'test.csv' }] }
      };
      
      changeHandler(mockEvent);
      
      // Simulate file load
      const loadEvent = {
        target: { result: 'csv,data\ntest,value' }
      };
      mockReader.onload(loadEvent);
      
      expect(mockScope.$apply).toHaveBeenCalled();
      expect(mockScope.fileread).toBe('csv,data\ntest,value');
    });
  });

  describe('dropzone directive', () => {
    let directiveFactory;
    let mockElement;
    let mockScope;
    let mockAttributes;

    beforeEach(() => {
      // Get the dropzone directive factory
      const directiveCalls = mockModule.directive.mock.calls;
      const dropzoneCall = directiveCalls.find(call => call[0] === 'dropzone');
      // The directive is defined as an array with the function as the last element
      directiveFactory = dropzoneCall[1][0];

      mockScope = {
        dropzone: null,
        $apply: jest.fn((fn) => fn && fn())
      };
      
      mockElement = {
        bind: jest.fn(),
        addClass: jest.fn(),
        removeClass: jest.fn()
      };
      
      mockAttributes = {
        encoding: 'UTF-8'
      };
    });

    test('should register dropzone directive', () => {
      expect(directiveFactory).toBeDefined();
      expect(typeof directiveFactory).toBe('function');
    });

    test('should configure directive correctly', () => {
      const directiveConfig = directiveFactory();
      
      expect(directiveConfig.transclude).toBe(true);
      expect(directiveConfig.replace).toBe(true);
      expect(directiveConfig.template).toBe('<div class="dropzone"><div ng-transclude></div></div>');
      expect(directiveConfig.scope).toEqual({
        dropzone: "="
      });
    });

    test('should bind drag and drop events', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      const expectedEvents = ['dragenter', 'dragover', 'dragleave', 'drop', 'paste'];
      expectedEvents.forEach(eventName => {
        expect(mockElement.bind).toHaveBeenCalledWith(eventName, expect.any(Function));
      });
    });

    test('should handle dragenter event', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      // Get the dragenter handler
      const bindCalls = mockElement.bind.mock.calls;
      const dragenterCall = bindCalls.find(call => call[0] === 'dragenter');
      const dragenterHandler = dragenterCall[1];
      
      const mockEvent = {
        preventDefault: jest.fn()
      };
      
      dragenterHandler(mockEvent);
      
      expect(mockElement.addClass).toHaveBeenCalledWith('dragging');
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    test('should handle dragover event', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      const bindCalls = mockElement.bind.mock.calls;
      const dragoverCall = bindCalls.find(call => call[0] === 'dragover');
      const dragoverHandler = dragoverCall[1];
      
      const mockEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: {
          effectAllowed: 'move',
          dropEffect: null
        }
      };
      
      dragoverHandler(mockEvent);
      
      expect(mockElement.addClass).toHaveBeenCalledWith('dragging');
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockEvent.dataTransfer.dropEffect).toBe('move');
    });

    test('should handle dragleave event', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      const bindCalls = mockElement.bind.mock.calls;
      const dragleaveCall = bindCalls.find(call => call[0] === 'dragleave');
      const dragleaveHandler = dragleaveCall[1];
      
      const mockEvent = {
        preventDefault: jest.fn()
      };
      
      dragleaveHandler(mockEvent);
      
      expect(mockElement.removeClass).toHaveBeenCalledWith('dragging');
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    test('should handle drop event', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      const bindCalls = mockElement.bind.mock.calls;
      const dropCall = bindCalls.find(call => call[0] === 'drop');
      const dropHandler = dropCall[1];
      
      const mockReader = {
        onload: null,
        readAsText: jest.fn()
      };
      global.FileReader = jest.fn(() => mockReader);
      
      // Mock the global 'file' variable that's used in the directive
      global.file = null;
      
      const mockEvent = {
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        dataTransfer: {
          files: [{ name: 'dropped.csv', size: 200 }]
        }
      };
      
      dropHandler(mockEvent);
      
      expect(mockElement.removeClass).toHaveBeenCalledWith('dragging');
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(global.FileReader).toHaveBeenCalled();
      expect(mockReader.readAsText).toHaveBeenCalledWith(mockEvent.dataTransfer.files[0], 'UTF-8');
    });

    test('should handle paste event with text data', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      const bindCalls = mockElement.bind.mock.calls;
      const pasteCall = bindCalls.find(call => call[0] === 'paste');
      const pasteHandler = pasteCall[1];
      
      // Mock the global 'data' variable that's used in the directive
      global.data = null;
      
      const mockDataItem = {
        type: 'text/plain',
        getAsString: jest.fn((callback) => callback('pasted,csv,data\nrow1,row2,row3'))
      };
      
      const mockEvent = {
        clipboardData: {
          items: [mockDataItem]
        }
      };
      
      pasteHandler(mockEvent);
      
      expect(mockDataItem.getAsString).toHaveBeenCalledWith(expect.any(Function));
      expect(mockScope.$apply).toHaveBeenCalled();
      expect(mockScope.dropzone).toBe('pasted,csv,data\nrow1,row2,row3');
    });

    test('should handle paste event with no text data', () => {
      const directiveConfig = directiveFactory();
      directiveConfig.link(mockScope, mockElement, mockAttributes);
      
      const bindCalls = mockElement.bind.mock.calls;
      const pasteCall = bindCalls.find(call => call[0] === 'paste');
      const pasteHandler = pasteCall[1];
      
      // Mock the global 'data' variable that's used in the directive
      global.data = null;
      
      const mockEvent = {
        clipboardData: {
          items: [
            { type: 'image/png' },
            { type: 'application/json' }
          ]
        }
      };
      
      pasteHandler(mockEvent);
      
      // Should not call $apply since no text/plain data found
      expect(mockScope.$apply).not.toHaveBeenCalled();
    });
  });
});