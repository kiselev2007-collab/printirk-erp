const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.env.CALCULATOR_ROOT||path.resolve(__dirname,'..');

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
    async recognize(text){element('orderText').value=text;await run('recognize()');const items=JSON.parse(run('JSON.stringify(detected)'));return items.flatMap(x=>x.sizes?x.sizes.map(s=>({...x,...s,sizes:undefined})):x);},
    addAll(){run('detected.forEach((_,i)=>addDetected(i))');return JSON.parse(run('JSON.stringify(autoItems)'));}
  };
}
const print='Пленка 720 дпи, ламинация глянец. Резка в край. 930*955мм 12шт, 1420*955мм 6 шт';
const works='930*955мм 12шт, 1420*955мм 6 шт  Демонтаж старой пленки и монтаж новой пленки';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('row 46: A5 folded certificates print on A4, score once and suggest editable 300 gsm',async()=>{
 const c=await calculator(),[x]=await c.recognize('Сертификаты 50шт - формат А5 в согнутом варианте - софт тач - плотные');
 assert.equal(x.type,'poly');assert.equal(x.finishedFormat,'A5');assert.equal(x.format,'A4');
 assert.deepEqual([x.wmm,x.hmm,x.qty,x.density,x.paperKey,x.post.bigs,x.lamination],[210,297,50,300,'300',1,'roll_soft']);
 const [item]=c.addAll();close(item.price,2610);assert.match(c.elements.get('autoSummaryItems').innerHTML,/готовый A5 в сгибе/);
 c.run("detected[0].density=170;detected[0].paperKey='170'");assert.equal(JSON.parse(c.run('JSON.stringify(detected[0])')).density,170);
});
for(const [row,source] of [[47,'баннер 440 гр 2000х1300 мм с люверсами 2 баннера'],[48,'баннер 440 гр 2000х1300 мм с люверсами 2 шт.']])test('row '+row+': product quantity is separate from grommets',async()=>{
 const c=await calculator(),[x]=await c.recognize(source);assert.equal(x.qty,2);assert.equal(x.grommetCount,0);assert.equal(x.grommet,300);
 close(c.addAll()[0].price,2398.6);
});
test('explicit 2 grommets on each of 2 banners; component count alone does not become product quantity',async()=>{
 const c=await calculator();let [x]=await c.recognize('Баннер 440 гр., 2х1 м., 2 люверса 2 шт.');
 assert.equal(x.qty,2);assert.equal(x.grommetCount,2);assert.ok(c.addAll()[0].details.some(d=>/люверсы 4 шт/.test(d)));
 [x]=await c.recognize('Баннер 440 гр 2х1м люверсы 4 шт');assert.equal(x.qty,1);assert.equal(x.grommetCount,4);
});
test('row 49: 6 pockets do not become 6 stands',async()=>{
 const c=await calculator(),[x]=await c.recognize('Стенд Информационный ПВХ 5 мм. 900х900 мм., карманы А4 плоские 6 шт');
 assert.equal(x.qty,1);assert.equal(x.pocketCount,6);close(c.addAll()[0].price,4650.6);
 const [two]=await c.recognize('2 стенда ПВХ 5мм 900х900мм, карманы A4 плоские 6 шт');assert.equal(two.qty,2);
});
test('row 50: dots, hyphens and adjacent size/quantity groups form one assignment',async()=>{
 const c=await calculator(),items=await c.recognize('Наклейки 720 дпи, глянец с резкой в край 870х360 мм.-3 шт 300х300 мм-1 шт.');
 assert.deepEqual(items.map(x=>[x.wmm||x.w*1000,x.hmm||x.h*1000,x.qty]),[[870,360,3],[300,300,1]]);
 assert.equal(c.run('detected.length'),1);close(c.addAll()[0].price,810.6384);
});
test('row 51: installation of a banner on timber calculates work only',async()=>{
 const c=await calculator(),[x]=await c.recognize('Монтаж баннера на брусок 1х1 м');assert.equal(x.type,'installation_work');
 const [item]=c.addAll();close(item.price,220);assert.match(item.name,/Монтаж баннера на брусок/);assert.equal(item.costKnown,false);
 assert.ok(!item.details.some(d=>/печать/.test(d)));assert.deepEqual(c.alerts,[]);
});
test('row 52: A2 poster at 1440 dpi with edge cutting',async()=>{
 const c=await calculator(),[x]=await c.recognize('Постер А2 1440дпи с резкой в край');
 assert.deepEqual([x.type,x.wmm,x.hmm,x.dpi,x.edgeCut],['poster',420,594,1440,true]);
 const [item]=c.addAll();close(item.price,.42*.594*659+2*(.42+.594)*22);assert.deepEqual(c.alerts,[]);
});
test('row 53: packet lamination uses 24 printed A3 sheets, not 470 finished pieces',async()=>{
 const c=await calculator();await c.recognize('Печать 83х63мм 4+0 300г с глянц лам 100мкм - 470шт');
 c.run("detected[0].packetLamFormat='A3'");const [item]=c.addAll();close(item.price,2424);
 assert.ok(item.details.some(d=>/Пакетная.*A3: 24 лист/.test(d)));
});
test('row 54: triangular prisms use A4 4+0, 300 gsm, two scores and tape per piece',async()=>{
 const c=await calculator(),[x]=await c.recognize('Призмы треугольные 30 шт.');
 assert.deepEqual([x.type,x.format,x.color,x.density,x.qty,x.post.bigs,x.post.tape],['poly','A4','4+0',300,30,2,30]);close(c.addAll()[0].price,1392);
});
test('row 55: journal with 2700 A3 sheets keeps the final digital tier',async()=>{
 const c=await calculator();await c.recognize('Журнал 36 страниц 100 шт');c.run('detected[0].qty=300');
 const calc=JSON.parse(c.run('JSON.stringify(brochureDigitalCalc(detected[0]))'));assert.equal(calc.sheets,2700);assert.equal(calc.unit,45);assert.ok(calc.sale>0);
 assert.equal(c.addAll().length,1);assert.deepEqual(c.alerts,[]);
});
for(const text of ['печать черно-белая А5 12шт 1+0 170г','ЧБ А5 12шт 170г','печать A5 1+0 170г 12шт'])test('row 56: '+text,async()=>{
 const c=await calculator(),[x]=await c.recognize(text);assert.deepEqual([x.type,x.color,x.technology,x.density],['poly','1+0','digital',170]);
 close(c.addAll()[0].price,84);assert.match(c.elements.get('detected').innerHTML,/>1\+1<\/option>/);assert.deepEqual(c.alerts,[]);
});
test('two-sided BW digital printing and large color runs remain calculable',async()=>{
 const c=await calculator();const [x]=await c.recognize('ЧБ A5 12шт 1+1 170г');assert.equal(x.color,'1+1');close(c.addAll()[0].price,114);
 await c.recognize('цифровая печать А4 4+0 170г 6000шт');assert.equal(c.addAll().length,2);assert.deepEqual(c.alerts,[]);
});
test('row 57: 250 finished A4 prints laminate as 125 A3 sheets for 5500 rubles',async()=>{
 const c=await calculator();await c.recognize('распечатка а4 4+0 170 гр с пакетной лам глянец 100 мкр 250 шт');
 c.run('detected[0].post.cutPasses=4');const [item]=c.addAll();close(item.price,10713);assert.ok(item.details.some(d=>/A3: 125 лист.*5\s*500/.test(d)));
});
test('row 58: confirmed batch cutting rate gives 43 packages at 60, total cutting 2580',async()=>{
 const c=await calculator();await c.recognize('листовка 148х60 мм 150000 шт 1+0 80 гр тиражирование');
 const lay=JSON.parse(c.run('JSON.stringify(duplicationLayout(detected[0]))'));assert.equal(lay.printSheets,10715);assert.equal(lay.cutBatches,43);close(lay.cutSale,2580);
 const [item]=c.addAll();close(item.price,43297);assert.ok(item.details.some(d=>/все проходы включены/.test(d)));
});
for(const [text,price] of [
 ['Монтаж баннера на профлист 2х3м',6*495],['Монтаж баннера в бетон 2х3м',6*495],
 ['Монтаж баннера на саморезы 1х2м',2*220],['Монтаж баннера на металлокаркас 1х2м',2*220],
 ['Демонтаж баннера с бруска 1х2м',2*94],['Монтаж баннера 3х6м',5280],['Демонтаж баннера 3х6м',1099],
 ['Натяжка баннера на изготовленную из бруска конструкцию 1х2м',6*220],
 ['Монтаж рамной конструкции из бруска 1х2м',2*220],['Монтаж рамной конструкции из профтрубы 1х2м',2*220],
 ['Монтаж прожектора 3шт',3*550],['Монтаж светодиодной ленты 10 п.м.',10*220],['Выезд на замер в черте города',0],
 ['Монтаж баннера на брусок 1х2м ночной со спецтехникой',2*220*2*1.1]
])test('installation catalog: '+text,async()=>{
 const c=await calculator(),[x]=await c.recognize(text);assert.equal(x.type,'installation_work');const items=c.addAll();assert.equal(items.length,1);close(items[0].price,price);assert.deepEqual(c.alerts,[]);
});
test('percentage mounting asks for item value and all actionable mounting catalog rows are selectable',async()=>{
 const c=await calculator();await c.recognize('Монтаж готового изделия из АКП');assert.equal(c.addAll().length,0);assert.match(c.alerts.at(-1),/стоимость изделий/);
 c.run('detected[0].baseValue=10000');close(c.addAll()[0].price,2000);
 const services=JSON.parse(c.run('JSON.stringify(installationServices())'));assert.ok(services.length>=17);
 const card=c.elements.get('detected').innerHTML;for(const s of services)assert.ok(card.includes(s.name),s.name);
});

test('one assignment from the screenshot: one card, one Add button and one complete order item',async()=>{
  const c=await calculator(),source='Пленка 720 дпи, ламинация глянец. Резка в край. Демонтаж старой пленки и монтаж новой пленки\n930*955мм 12шт, 1420*955мм 6шт';
  await c.recognize(source);
  assert.equal(c.run('detected.length'),1);assert.equal(c.run('detected[0].source'),source);
  const card=c.elements.get('detected').innerHTML;
  assert.equal((card.match(/class="detected-card"/g)||[]).length,1);
  assert.equal((card.match(/>Добавить<\/button>/g)||[]).length,1);
  assert.match(card,/930×955 мм/);assert.match(card,/1420×955 мм/);assert.match(card,/Всего 18 шт/);assert.match(card,/18\.7944 м²/);
  const [item]=c.addAll();assert.equal(c.run('autoItems.length'),1);close(item.price,47067.1392);
  assert.equal(item.source,source);assert.equal(item.costKnown,false);
  assert.equal((c.elements.get('autoSummaryItems').innerHTML.match(/class="summary-item"/g)||[]).length,1);
  c.run('removeAuto(0)');assert.equal(c.run('autoItems.length'),0);
});
test('common controls update every size and preserve choices on redraw',async()=>{
  const c=await calculator();await c.recognize(print+' Демонтаж и монтаж пленки');
  c.run("detected[0].lamination='none';detected[0].filmRemove=false;renderDetected()");
  const [item]=c.addAll();close(item.price,18.7944*(604+660)+73.74*22);
  assert.ok(!item.details.some(d=>/^ламинация |^Демонтаж плёнки/.test(d)));
  assert.equal(item.details.filter(d=>/^Монтаж плёнки/.test(d)).length,2);
});
test('a shared header groups sizes on separate lines; explicitly separate products stay separate',async()=>{
  const c=await calculator();await c.recognize('Пленка 720 dpi\n930х955мм 12шт\n1420х955мм 6шт');
  assert.equal(c.run('detected.length'),1);assert.equal(c.run('detected[0].sizes.length'),2);
  await c.recognize('Пленка 720 dpi 930х955мм 12шт\nБаннер 440г 1420х955мм 6шт');
  assert.equal(c.run('detected.length'),2);assert.equal(c.run('detected.some(x=>x.sizes)'),false);
});
test('different finishing under a shared header stays independently editable',async()=>{
  const c=await calculator();await c.recognize('Пленка 720 dpi\n930х955мм 12шт ламинация глянец\n1420х955мм 6шт без ламинации');
  assert.equal(c.run('detected.length'),2);
});
test('failed grouped calculation preserves existing order items and adds no partial order',async()=>{
  const c=await calculator();await c.recognize('Баннер 440г 1х2м');const [existing]=c.addAll();
  await c.recognize(works);c.run('catalogData.sections.constructions_installation.mounting=[]');
  const items=c.addAll();assert.equal(items.length,1);close(items[0].price,existing.price);
  assert.match(c.alerts.at(-1),/Не найден тариф/);assert.equal(c.run('calculatingGroup'),false);
});

test('row 43: both sizes retain quantities, resolution, lamination and cutting; full totals',async()=>{
  const c=await calculator(),items=await c.recognize(print);
  assert.deepEqual(items.map(x=>[x.type,x.w,x.h,x.qty,x.dpi,x.laminate,x.lamGloss,x.edgeCut]),
    [['film',.93,.955,12,720,true,true,true],['film',1.42,.955,6,720,true,true,true]]);
  const added=c.addAll();assert.equal(added.length,1);assert.deepEqual(c.alerts,[]);
  const area=.93*.955*12+1.42*.955*6,perimeter=2*(.93+.955)*12+2*(1.42+.955)*6;
  close(area,18.7944);close(perimeter,73.74);
  close(added.reduce((s,x)=>s+x.price,0),area*(604+274)+perimeter*22);
  close(added.reduce((s,x)=>s+x.cost,0),area*(315+54.78)+perimeter*20);
  for(const x of added){assert.equal(x.details.filter(d=>/^печать /.test(d)).length,2);assert.ok(x.details.some(d=>/^ламинация /.test(d)));assert.ok(x.details.some(d=>/^резка в край /.test(d)));}
});
test('rows 44–45: both work operations for both sizes, no unrequested printing',async()=>{
  const c=await calculator(),items=await c.recognize(works);
  assert.deepEqual(items.map(x=>[x.type,x.w,x.h,x.qty,x.filmMount,x.filmRemove]),
    [['film_work',.93,.955,12,true,true],['film_work',1.42,.955,6,true,true]]);
  const added=c.addAll();assert.equal(added.length,1);assert.deepEqual(c.alerts,[]);
  close(added.reduce((s,x)=>s+x.price,0),18.7944*(660+880));
  for(const x of added){assert.equal(x.costKnown,false);assert.equal(x.details.filter(d=>/^Монтаж плёнки/.test(d)).length,2);assert.equal(x.details.filter(d=>/^Демонтаж плёнки/.test(d)).length,2);assert.ok(!x.details.some(d=>/^печать /.test(d)));}
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
