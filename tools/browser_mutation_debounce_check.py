from playwright.sync_api import sync_playwright
import json, sys
BASE='http://127.0.0.1:5500/local.html'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True); page=browser.new_page(); errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE,wait_until='networkidle')
    result=page.evaluate("""async () => {
      const empty={budgets:[],units:[],scheduleTypes:[],hourSettings:[],calendarPeriods:[],calendarRows:[],calendarHolidays:[],salaryEntries:[],forecastEvaluations:[],holidayNames:[]};
      const calls=[];let success,failure;const runner={withSuccessHandler(fn){success=fn;return runner},withFailureHandler(fn){failure=fn;return runner},runServerFunction(action,payload){if(action==='getWorkStudyBootstrapData')return success({ok:true,data:structuredClone(empty)});calls.push({action,payload});setTimeout(()=>success({ok:true,result:{collection:payload.collection,rows:structuredClone(payload.rows),clientGeneration:payload.clientGeneration}}),25)}};
      window.WORK_STUDY_CONFIG={DATA_MODE:'gasSheet'};window.WORK_STUDY_RUNTIME_CONFIG={writeMode:'enabled',allowLocalFallback:false};window.google={script:{run:runner}};
      const ds=await import('/js/dataStore.js?browser-debounce='+Date.now());await ds.initDataStore();
      const p1=ds.saveUnit({unitCode:'U',unitName:'A'}),id=ds.getUnits()[0].id,p2=ds.saveUnit({id,unitCode:'U',unitName:'B'}),p3=ds.saveUnit({id,unitCode:'U',unitName:'C'});await Promise.all([p1,p2,p3]);
      return {requests:calls.length,action:calls[0]?.action,finalName:ds.getUnits()[0]?.unitName,payloadName:calls[0]?.payload.rows[0]?.unitName};
    }""")
    browser.close()
ok=result=={'requests':1,'action':'replaceCollection','finalName':'C','payloadName':'C'} and not errors
print(json.dumps({'status':'PASS' if ok else 'FAIL','result':result,'errors':errors},ensure_ascii=False));sys.exit(0 if ok else 1)
