from playwright.sync_api import sync_playwright
import json, sys
BASE='http://127.0.0.1:5500/local.html'
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True);page=browser.new_page();errors=[];page.goto(BASE,wait_until='networkidle')
    result=page.evaluate("""async () => {const empty={budgets:[],units:[{id:'UNIT_existing01',unitCode:'U',unitName:'A'}],scheduleTypes:[],hourSettings:[],calendarPeriods:[],calendarRows:[],calendarHolidays:[],salaryEntries:[],forecastEvaluations:[],holidayNames:[]};let success,failure;const runner={withSuccessHandler(fn){success=fn;return runner},withFailureHandler(fn){failure=fn;return runner},runServerFunction(action,payload){if(action==='getWorkStudyBootstrapData')return success({ok:true,data:structuredClone(empty)});setTimeout(()=>failure(new Error('forced failure')),25)}};window.WORK_STUDY_CONFIG={DATA_MODE:'gasSheet'};window.WORK_STUDY_RUNTIME_CONFIG={writeMode:'enabled',allowLocalFallback:false};window.google={script:{run:runner}};const ds=await import('/js/dataStore.js?browser-rollback='+Date.now());await ds.initDataStore();const phases=[];ds.subscribeCollection(e=>phases.push(e.phase));let rejected=false;try{await ds.saveUnit({id:'UNIT_existing01',unitCode:'U',unitName:'B'})}catch(e){rejected=true}return {rejected,name:ds.getUnits()[0].unitName,rollback:phases.includes('rollback')}}""")
    browser.close()
ok=result=={'rejected':True,'name':'A','rollback':True};print(json.dumps({'status':'PASS' if ok else 'FAIL','result':result},ensure_ascii=False));sys.exit(0 if ok else 1)
