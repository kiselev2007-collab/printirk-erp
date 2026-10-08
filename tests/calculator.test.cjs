const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

async function calculator(){
  const html=fs.readFileSync(process.env.CALCULATOR_HTML||path.join(root,'index.html'),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(script); // Compile the complete page, including the independent sign calculator.
  const elements=new Map(),alerts=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',style:{},dataset:{},
      classList:{add(){},remove(){}},setAttribute(){},addEventListener(){},scrollIntoView(){}});
    return elements.get(id);
  };
  const context=vm.createContext({
    document:{getElementById:element,querySelector:element,querySelectorAll:()=>[]},
    localStorage:{getItem:()=>null,setItem(){}},location:{href:'http://localhost/'},
    alert:message=>alerts.push(message),console,URL,URLSearchParams,Blob,
    fetch:async file=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'))})
  });
  // The sign estimator has independent DOM inputs. Run the actual automatic calculator.
  vm.runInContext(script.slice(0,script.indexOf('const signConfigs=')),context);
  await vm.runInContext('Promise.all([catalogReady,synonymReady])',context);
  const run=code=>vm.runInContext(code,context);
  return {run,alerts,elements,
    async recognize(text){element('orderText').value=text;await run('recognize()');return JSON.parse(run('JSON.stringify(detected)'));},
    addAll(){run('detected.forEach((_,i)=>addDetected(i))');return JSON.parse(run('JSON.stringify(autoItems)'));}
  };
}
const print='Пленка 720 дпи, ламинация глянец. Резка в край. 930*955мм 12шт, 1420*955мм 6 шт';
const works='930*955мм 12шт, 1420*955мм 6 шт  Демонтаж старой пленки и монтаж новой пленки';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('row 43: both sizes retain quantities, resolution, lamination and cutting; full totals',async()=>{
  const c=await calculator(),items=await c.recognize(print);
  assert.deepEqual(items.map(x=>[x.type,x.w,x.h,x.qty,x.dpi,x.laminate,x.lamGloss,x.edgeCut]),
    [['film',.93,.955,12,720,true,true,true],['film',1.42,.955,6,720,true,true,true]]);
  const added=c.addAll();assert.equal(added.length,2);assert.deepEqual(c.alerts,[]);
  const area=.93*.955*12+1.42*.955*6,perimeter=2*(.93+.955)*12+2*(1.42+.955)*6;
  close(area,18.7944);close(perimeter,73.74);
  close(added.reduce((s,x)=>s+x.price,0),area*(604+274)+perimeter*22);
  close(added.reduce((s,x)=>s+x.cost,0),area*(315+54.78)+perimeter*20);
  for(const x of added){assert.equal(x.details.filter(d=>/^печать /.test(d)).length,1);assert.ok(x.details.some(d=>/^ламинация /.test(d)));assert.ok(x.details.some(d=>/^резка в край /.test(d)));}
});
test('rows 44–45: both work operations for both sizes, no unrequested printing',async()=>{
  const c=await calculator(),items=await c.recognize(works);
  assert.deepEqual(items.map(x=>[x.type,x.w,x.h,x.qty,x.filmMount,x.filmRemove]),
    [['film_work',.93,.955,12,true,true],['film_work',1.42,.955,6,true,true]]);
  const added=c.addAll();assert.equal(added.length,2);assert.deepEqual(c.alerts,[]);
  close(added.reduce((s,x)=>s+x.price,0),18.7944*(660+880));
  for(const x of added){assert.equal(x.costKnown,false);assert.equal(x.details.filter(d=>/^Монтаж плёнки/.test(d)).length,1);assert.equal(x.details.filter(d=>/^Демонтаж плёнки/.test(d)).length,1);assert.ok(!x.details.some(d=>/^печать /.test(d)));}
  assert.match(c.elements.get('autoSummaryItems').innerHTML,/1420×955 мм · 6 шт/);
  assert.match(c.elements.get('detected').innerHTML,/Демонтаж плёнки и зачистка клея/);
});
test('demount alone does not imply mount; negated operations are excluded',async()=>{
  const c=await calculator();
  let [x]=await c.recognize('Демонтаж пленки 1000х2000мм 2 шт');
  assert.equal(x.type,'film_work');assert.equal(x.filmRemove,true);assert.equal(x.filmMount,false);
  close(c.addAll()[0].price,4*880);
  [x]=await c.recognize('Пленка 720 dpi 1х2м без монтажа и без демонтажа');
  assert.equal(x.type,'film');assert.equal(x.filmMount,false);assert.equal(x.filmRemove,false);
});
test('printed film with both works includes each operation exactly once and hides unknown cost',async()=>{
  const c=await calculator();await c.recognize('Печать пленки 720 dpi 1000х2000мм 2 шт, демонтаж и монтаж');
  const [x]=c.addAll();close(x.price,4*(604+660+880));assert.equal(x.costKnown,false);
  assert.match(c.elements.get('autoSummaryItems').innerHTML,/демонтаж плёнки, монтаж плёнки/);
});
test('UV printed film also includes requested mounting',async()=>{
  const c=await calculator();await c.recognize('УФ печать пленки прозрачной 1000х2000мм 2 шт монтаж');
  const [x]=c.addAll();assert.ok(x.details.some(d=>/^Монтаж плёнки/.test(d)));assert.ok(x.details.some(d=>/^УФ CMYK/.test(d)));assert.deepEqual(c.alerts,[]);
});
test('work controls preserve an edited lamination choice when the card redraws',async()=>{
  const c=await calculator();await c.recognize('Пленка 720 dpi 1х2м ламинация глянец');
  c.run("detected[0].lamination='matte';detected[0].filmMount=true;renderDetected()");
  assert.match(c.elements.get('detected').innerHTML,/<option value="matte" selected>/);
  c.run("detected[0].lamination='none';renderDetected()");
  const [x]=c.addAll();close(x.price,2*(604+660));assert.ok(!x.details.some(d=>/^ламинация /.test(d)));
});
test('mount only, missing sizes and deselected work controls',async()=>{
  const c=await calculator();let [x]=await c.recognize('Монтаж пленки 50х60см 3 шт');
  assert.equal(x.filmRemove,false);close(c.addAll()[0].price,.5*.6*3*660);
  await c.recognize('Монтаж пленки');c.run('autoItems=[]');assert.equal(c.addAll().length,0);
  assert.match(c.elements.get('detected').innerHTML,/Укажите размер плёнки/);
  await c.recognize('Монтаж пленки 1х2м');c.run('detected[0].filmMount=false;autoItems=[]');assert.equal(c.addAll().length,0);assert.match(c.alerts.at(-1),/Выберите монтаж/);
});
test('missing live tariff blocks calculation instead of assigning a fabricated rate',async()=>{
  const c=await calculator();await c.recognize('Монтаж пленки 1х2м');
  c.run("catalogData.sections.constructions_installation.mounting=[]");
  assert.equal(c.addAll().length,0);assert.match(c.alerts[0],/Не найден тариф/);
});
test('decimal units, separators and suffix descriptions are preserved',async()=>{
  const c=await calculator();let items=await c.recognize('Плёнка 720 dpi 0,93х0,955м 12шт, 1,42х0,955м 6шт ламинация матовая');
  assert.deepEqual(items.map(x=>[x.w,x.h,x.qty,x.lamMatte]),[[.93,.955,12,true],[1.42,.955,6,true]]);
  items=await c.recognize('Плёнка 720 dpi\n930×955мм 12шт\n1420×955мм 6шт');
  assert.deepEqual(items.map(x=>[x.type,x.w,x.qty]),[['film',.93,12],['film',1.42,6]]);
  items=await c.recognize('Плёнка 720 dpi ламинация глянец\n930×955мм 12шт, 1420×955мм 6шт');
  assert.deepEqual(items.map(x=>[x.type,x.w,x.qty,x.lamGloss]),[['film',.93,12,true],['film',1.42,6,true]]);
  const distinct='Плёнка 930х955мм 12шт, баннер 1420х955мм 6шт';
  assert.equal(c.run(`splitPositions(${JSON.stringify(distinct)}).length`),1);
  assert.equal(c.run("splitPositions('Баннер на бруске 40х40мм 1000х1000мм').length"),1);
});
test('recommended work minimum stays advisory',async()=>{
  const c=await calculator();await c.recognize('Монтаж пленки 100х100мм');const [x]=c.addAll();
  close(x.price,6.6);assert.ok(x.details.some(d=>/5\s*000/.test(d)&&/не применяется/.test(d)));
});
for(const [text,type] of [
  ['УФ-ДТФ 280х120мм - 1 шт','uv_dtf'],
  ['холст 600х900мм','canvas'],
  ['холст на раме из бруска 600х900мм','canvas'],
  ['Флекс на футболку 300х300мм','apparel_application'],
  ['Печать А6 двухсторонняя цветная на бумаге 170г 30шт','poly'],
  ['визитки софт тач 90х50мм со скруглением углов 96шт','business_card'],
  ['табличка 4260х430мм из АКП 3мм пленка 720 dpi','sign_plate'],
  ['Баннер 850*2000мм резка в край','banner']
])test('regression: '+text,async()=>{
  const c=await calculator();const [x]=await c.recognize(text);assert.equal(x.type,type);
  const added=c.addAll();assert.equal(added.length,1);assert.ok(added[0].price>0);assert.deepEqual(c.alerts,[]);
});
