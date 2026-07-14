function doGet(){
  var t=HtmlService.createTemplateFromFile('Index');
  try {var c=getAppConfig_();t.shellError='';t.assetBase=getGithubPagesBaseUrl_();t.assetVersion=c.staticAssetVersion;t.runtimeJson=JSON.stringify({mode:'gas',version:c.appVersion,githubPagesBaseUrl:t.assetBase,spreadsheetConfigured:!!c.spreadsheetId,writeMode:c.writeMode,allowLocalFallback:false});}
  catch(e){t.shellError=e.message;t.assetBase='';t.assetVersion=PTB_VERSION;t.runtimeJson=JSON.stringify({mode:'gas',version:PTB_VERSION,githubPagesBaseUrl:'',spreadsheetConfigured:false,writeMode:'disabled',allowLocalFallback:false});}
  return t.evaluate().setTitle('工讀時薪計算系統').addMetaTag('viewport','width=device-width, initial-scale=1');
}
