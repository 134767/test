function doGet(){
  var t=HtmlService.createTemplateFromFile('Index');
  try {var ctx=createRequestContext_(),c=getAppConfig_(ctx);t.shellError='';t.assetBase=getGithubPagesBaseUrl_(ctx);t.appVersion=c.appVersion;t.assetVersion=c.staticAssetVersion;t.runtimeJson=JSON.stringify({mode:'gas',version:c.appVersion,appVersion:c.appVersion,assetVersion:c.staticAssetVersion,githubPagesBaseUrl:t.assetBase,spreadsheetConfigured:!!c.spreadsheetId,writeMode:c.writeMode,allowLocalFallback:false});}
  catch(e){t.shellError=e.message;t.assetBase='';t.appVersion=PTB_VERSION;t.assetVersion=PTB_ASSET_VERSION;t.runtimeJson=JSON.stringify({mode:'gas',version:PTB_VERSION,appVersion:PTB_VERSION,assetVersion:PTB_ASSET_VERSION,githubPagesBaseUrl:'',spreadsheetConfigured:false,writeMode:'disabled',allowLocalFallback:false});}
  return t.evaluate().setTitle('工讀時薪計算系統').addMetaTag('viewport','width=device-width, initial-scale=1');
}
