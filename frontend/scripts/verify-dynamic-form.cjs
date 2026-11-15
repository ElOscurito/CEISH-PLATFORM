const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const React=require(root+'/node_modules/react');
const {renderToStaticMarkup}=require(root+'/node_modules/react-dom/server');
const dir=root+'/src/features/extensions/dynamic-forms';
function load(name){
 const file=path.join(dir,name);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 const requireLocal=(id)=>id.endsWith('.css')?{}:id.startsWith('react')?require(root+'/node_modules/'+id):require(id);
 new Function('require','module','exports',js)(requireLocal,mod,mod.exports);
 return mod.exports;
}
const {validateAnswers}=load('dynamic-form.validation.ts');
const {DynamicFormRenderer}=load('DynamicFormRenderer.tsx');
const types=['text','textarea','single_select','multi_select','checkbox','file','criterion'];
const fields=types.map((fieldType,i)=>({id:'f'+i,fieldKey:'key'+i,label:'Campo '+fieldType,fieldType,isRequired:true,options:fieldType.includes('select')?[{value:'a',label:'Opción A'}]:[],displayOrder:i,helpText:'Ayuda'}));
const valid={f0:'texto',f1:'descripción',f2:'a',f3:['a'],f4:true,f5:['file'],f6:{status:'approved',observation:'',pageReference:null}};
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
check('all required types accept valid responses',()=>assert.deepEqual(validateAnswers(fields,valid),{}));
check('empty final form reports all required fields',()=>assert.equal(Object.keys(validateAnswers(fields,{})).length,7));
check('draft accepts missing required fields',()=>assert.deepEqual(validateAnswers(fields,{},false),{}));
for(const [name,id,value] of [['whitespace','f0','  '],['unknown option','f2','z'],['duplicate choices','f3',['a','a']],['consent','f4',false],['pending criterion','f6',{status:'pending',observation:'',pageReference:null}],['page range','f6',{status:'approved',observation:'',pageReference:0}],['file count','f5',Array.from({length:11},(_,i)=>String(i))]]){
 check('reject '+name,()=>assert.ok(validateAnswers(fields,{...valid,[id]:value})[id]));
}
const render=(extra={})=>renderToStaticMarkup(React.createElement(DynamicFormRenderer,{fields,answers:valid,onChange:()=>{},...extra}));
check('all seven field labels render',()=>{const html=render();for(const type of types)assert.ok(html.includes('Campo '+type));});
check('file uploader and textarea render',()=>{const html=render({onUpload:()=>{}});assert.ok(html.includes('type="file"'));assert.ok(html.includes('<textarea'));});
check('submitted view has disabled inputs and no upload',()=>{const html=render({readOnly:true});assert.ok(html.includes('disabled=""'));assert.ok(!html.includes('type="file"'));});
check('error associated with input',()=>{const html=render({errors:{f0:'Completa este campo'}});assert.ok(html.includes('aria-invalid="true"'));assert.ok(html.includes('role="alert"'));});
check('labels escape HTML',()=>{const html=render({fields:[{...fields[0],label:'<script>alert(1)</script>'}]});assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));});
check('file names render safely in read-only view',()=>{const html=render({readOnly:true,onDownload:()=>{},files:{f5:[{id:'file',documentName:'protocolo.pdf',sizeBytes:1024,mimeType:'application/pdf'}]}});assert.ok(html.includes('protocolo.pdf'));assert.ok(html.includes('Abrir'));assert.ok(!html.includes('Quitar'));});
console.log(`${passed} scenarios passed`);
