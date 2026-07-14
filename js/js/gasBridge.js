(function(global) {
  function isGasRuntime() {
    return (
      typeof global.google !== 'undefined' &&
      global.google.script &&
      global.google.script.run
    );
  }

  function gasRun(functionName, payload) {
    if (!isGasRuntime()) {
      return Promise.reject(new Error('google.script.run is not available outside GAS HtmlService.'));
    }

    return new Promise(function(resolve, reject) {
      const runner = global.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject);

      if (typeof payload === 'undefined') {
        runner[functionName]();
        return;
      }

      runner[functionName](payload);
    });
  }

  global.WorkStudyGasBridge = {
    isGasRuntime: isGasRuntime,
    gasRun: gasRun
  };
})(window);
