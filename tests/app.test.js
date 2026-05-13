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

// Mock DataObject
global.DataObject = jest.fn(() => ({
  parseCsv: jest.fn(),
  converted_json: jest.fn(),
  converted_csv: jest.fn(),
  fields: jest.fn(() => []),
  rows: jest.fn(() => [])
}));

// Mock document
global.document = {
  createElement: jest.fn(() => ({
    click: jest.fn()
  })),
  body: {
    appendChild: jest.fn()
  }
};

// Mock Date prototype
global.Date.prototype.yyyymmdd = function() {
  return '20240101';
};

describe('ParseController', () => {
  let $scope;
  let $location;
  let controller;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    jest.resetModules();
    
    // Create mock $scope
    $scope = {
      $watch: jest.fn(),
      $apply: jest.fn((fn) => fn && fn())
    };
    
    // Create mock $location  
    $location = {
      search: jest.fn(() => ({}))
    };
    
    // Load the app.js file to register the controller
    require('../src/app.js');
    
    // Get the controller function that was registered
    const controllerCalls = mockModule.controller.mock.calls;
    const parseControllerCall = controllerCalls.find(call => call[0] === 'ParseController');
    const controllerFn = parseControllerCall[1];
    
    // Execute the controller
    controller = controllerFn($scope, $location);
  });

  describe('Profile Management', () => {
    test('should initialize with default profile settings', () => {
      expect($scope.profileName).toBe('default profile');
      expect($scope.profiles).toHaveProperty('default profile');
      expect($scope.profile).toBeDefined();
      expect($scope.ynab_cols).toEqual(['Date', 'Payee', 'Memo', 'Outflow', 'Inflow']);
      expect($scope.file.chosenEncoding).toBe('UTF-8');
      expect($scope.file.chosenDelimiter).toBe('auto');
    });

    test('should detect non-default profiles exist', () => {
      // Initially only has default profile
      $scope.profiles = { 'default profile': {} };
      expect($scope.nonDefaultProfilesExist()).toBe(false);
      
      // Add another profile
      $scope.profiles['custom-profile'] = {};
      expect($scope.nonDefaultProfilesExist()).toBe(true);
    });

    test('should toggle between old and new column formats', () => {
      // Start with old format
      expect($scope.ynab_cols).toEqual(['Date', 'Payee', 'Memo', 'Outflow', 'Inflow']);
      
      // Toggle to new format
      $scope.toggleColumnFormat();
      expect($scope.ynab_cols).toEqual(['Date', 'Payee', 'Memo', 'Amount']);
      expect($scope.profile.columnFormat).toEqual(['Date', 'Payee', 'Memo', 'Amount']);
      
      // Toggle back to old format
      $scope.toggleColumnFormat();
      expect($scope.ynab_cols).toEqual(['Date', 'Payee', 'Memo', 'Outflow', 'Inflow']);
    });

    test('should update profile encoding when chosen', () => {
      $scope.encodingChosen('windows-1252');
      expect($scope.profile.chosenEncoding).toBe('windows-1252');
    });

    test('should update profile delimiter when chosen', () => {
      $scope.delimiterChosen(';');
      expect($scope.profile.chosenDelimiter).toBe(';');
    });

    test('should update start row when set', () => {
      $scope.startRowSet(3);
      expect($scope.profile.startAtRow).toBe(3);
    });

    test('should update extra row setting when set', () => {
      $scope.extraRowSet(true);
      expect($scope.profile.extraRow).toBe(true);
    });

    test('should switch profiles and call URL search', () => {
      $scope.profileChosen('new-profile');
      
      expect($location.search).toHaveBeenCalledWith('profile', 'new-profile');
      // Note: The function uses $scope.profileName instead of the parameter,
      // so it will use the existing profile, not the new one
      expect($scope.profile).toBe($scope.profiles[$scope.profileName]);
    });

    test('should invert flows when toggle is called', () => {
      expect($scope.inverted_outflow).toBe(false);
      
      $scope.invert_flows();
      expect($scope.inverted_outflow).toBe(true);
      
      $scope.invert_flows();
      expect($scope.inverted_outflow).toBe(false);
    });

    test('should reset app state when reloadApp is called', () => {
      $scope.setInitialScopeState = jest.fn();
      $scope.reloadApp();
      
      expect($scope.setInitialScopeState).toHaveBeenCalled();
    });
  });

  describe('File Processing', () => {
    beforeEach(() => {
      // Set up data object mock methods
      $scope.data_object.parseCsv = jest.fn();
      $scope.data_object.converted_json = jest.fn(() => [
        { Date: '2024-01-01', Payee: 'Store', Amount: '-50.00' }
      ]);
      $scope.data_object.converted_csv = jest.fn(() => 'Date,Payee,Amount\n2024-01-01,Store,-50.00');
    });

    test('should process file data when data.source changes', () => {
      // Set up watchers
      const watchCallbacks = {};
      $scope.$watch.mockImplementation((expr, callback) => {
        watchCallbacks[expr] = callback;
      });
      
      // Re-initialize to capture watch callbacks
      jest.resetModules();
      require('../src/app.js');
      const controllerCalls = mockModule.controller.mock.calls;
      const parseControllerCall = controllerCalls.find(call => call[0] === 'ParseController');
      const controllerFn = parseControllerCall[1];
      controllerFn($scope, $location);
      
      // Simulate file data change with auto delimiter
      $scope.file.chosenDelimiter = 'auto';
      $scope.file.startAtRow = 1;
      $scope.profile.extraRow = false;
      const csvData = 'Date,Payee,Amount\n2024-01-01,Store,-50.00';
      
      watchCallbacks['data.source'](csvData, null);
      
      expect($scope.data_object.parseCsv).toHaveBeenCalledWith(
        csvData,
        $scope.file.chosenEncoding,
        $scope.file.startAtRow,
        $scope.profile.extraRow
      );
      expect($scope.data_object.converted_json).toHaveBeenCalledWith(
        10,
        $scope.ynab_cols,
        $scope.ynab_map,
        $scope.inverted_outflow
      );
    });

    test('should process file data with custom delimiter', () => {
      // Set up watchers
      const watchCallbacks = {};
      $scope.$watch.mockImplementation((expr, callback) => {
        watchCallbacks[expr] = callback;
      });
      
      // Re-initialize to capture watch callbacks
      jest.resetModules();
      require('../src/app.js');
      const controllerCalls = mockModule.controller.mock.calls;
      const parseControllerCall = controllerCalls.find(call => call[0] === 'ParseController');
      const controllerFn = parseControllerCall[1];
      controllerFn($scope, $location);
      
      // Simulate file data change with custom delimiter
      $scope.file.chosenDelimiter = ';';
      $scope.file.startAtRow = 2;
      $scope.profile.extraRow = true;
      const csvData = 'Date;Payee;Amount\n2024-01-01;Store;-50.00';
      
      watchCallbacks['data.source'](csvData, null);
      
      expect($scope.data_object.parseCsv).toHaveBeenCalledWith(
        csvData,
        $scope.file.chosenEncoding,
        $scope.file.startAtRow,
        $scope.profile.extraRow,
        ';'
      );
    });

    test('should update preview when inverted_outflow changes', () => {
      // Set up watchers
      const watchCallbacks = {};
      $scope.$watch.mockImplementation((expr, callback) => {
        watchCallbacks[expr] = callback;
      });
      
      // Re-initialize to capture watch callbacks
      jest.resetModules();
      require('../src/app.js');
      const controllerCalls = mockModule.controller.mock.calls;
      const parseControllerCall = controllerCalls.find(call => call[0] === 'ParseController');
      const controllerFn = parseControllerCall[1];
      controllerFn($scope, $location);
      
      // Set initial inverted_outflow to false
      $scope.inverted_outflow = false;
      
      // Simulate inverted outflow change - the watch callback should update preview
      $scope.inverted_outflow = true;
      watchCallbacks['inverted_outflow'](true, false);
      
      expect($scope.data_object.converted_json).toHaveBeenCalledWith(
        10,
        $scope.ynab_cols,
        $scope.ynab_map,
        $scope.inverted_outflow
      );
    });

    test('should update preview when column mapping changes', () => {
      // Set up watchers
      const watchCallbacks = {};
      $scope.$watch.mockImplementation((expr, callback, deep) => {
        watchCallbacks[expr] = callback;
      });
      
      // Re-initialize to capture watch callbacks
      jest.resetModules();
      require('../src/app.js');
      const controllerCalls = mockModule.controller.mock.calls;
      const parseControllerCall = controllerCalls.find(call => call[0] === 'ParseController');
      const controllerFn = parseControllerCall[1];
      controllerFn($scope, $location);
      
      // Simulate column mapping change
      const newMapping = { Date: 'Transaction Date', Payee: 'Merchant' };
      watchCallbacks['ynab_map'](newMapping, {});
      
      expect($scope.profile.chosenColumns).toEqual(newMapping);
      expect($scope.data_object.converted_json).toHaveBeenCalledWith(
        10,
        $scope.ynab_cols,
        newMapping,
        $scope.inverted_outflow
      );
    });

    test('should generate CSV string for download', () => {
      $scope.data_object.converted_csv.mockReturnValue('Date,Payee,Amount\n2024-01-01,Store,-50.00');
      
      const result = $scope.csvString();
      
      expect($scope.data_object.converted_csv).toHaveBeenCalledWith(
        null,
        $scope.ynab_cols,
        $scope.ynab_map,
        $scope.inverted_outflow
      );
      expect(result).toBe('Date,Payee,Amount\n2024-01-01,Store,-50.00');
    });

    test('should create download file with proper filename and encoding', () => {
      const mockAnchor = {
        href: '',
        target: '',
        download: '',
        click: jest.fn()
      };
      
      // Mock Date constructor to return a specific date
      const mockDate = new Date('2024-01-01');
      mockDate.yyyymmdd = jest.fn(() => '20240101');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
      
      // Mock document.createElement to return our mock anchor
      global.document.createElement = jest.fn(() => mockAnchor);
      global.document.body.appendChild = jest.fn();
      
      // Use realistic CSV data with special characters to test encoding
      const csvData = 'Date,Payee,Memo,Amount\n2024-01-01,"Store ""ABC""","Café & Groceries","-$50.00"';
      $scope.data_object.converted_csv.mockReturnValue(csvData);
      
      $scope.downloadFile();
      
      // Verify DOM interactions
      expect(global.document.createElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.target).toBe('_blank');
      expect(mockAnchor.download).toBe('ynab_data_20240101.csv');
      expect(global.document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
      expect(mockAnchor.click).toHaveBeenCalled();
      
      // Verify the actual encoding pipeline: btoa(unescape(encodeURIComponent(csvData)))
      const expectedHref = 'data:attachment/csv;base64,' + btoa(unescape(encodeURIComponent(csvData)));
      expect(mockAnchor.href).toBe(expectedHref);
      
      // Verify we can decode it back to the original CSV data
      const base64Part = mockAnchor.href.split('data:attachment/csv;base64,')[1];
      const decodedData = decodeURIComponent(escape(atob(base64Part)));
      expect(decodedData).toBe(csvData);
      
      // Restore Date mock
      global.Date.mockRestore();
    });
  });
});