const test=require('node:test'),assert=require('node:assert/strict');
const {lireReponse}=require('../api/_portalis-anthropic');
const event=e=>'event: '+e.type+'\r\ndata: '+JSON.stringify(e)+'\r\n\r\n';
function flux(events){
  const octets=new TextEncoder().encode(events.map(event).join(''));
  return new Response(new ReadableStream({start(c){for(let i=0;i<octets.length;i+=7)c.enqueue(octets.slice(i,i+7));c.close();}}),{headers:{'Content-Type':'text/event-stream'}});
}
test('le flux conserve les signatures, les outils, les citations et les usages cumulés',async()=>{
  const citation={type:'web_search_result_location',url:'https://www.legifrance.gouv.fr/',title:'Légifrance',encrypted_index:'fixture'};
  const contenu={type:'web_search_tool_result',tool_use_id:'recherche',content:[{type:'web_search_result',url:citation.url,encrypted_content:'fixture-chiffree'}]};
  const r=await lireReponse(flux([
    {type:'message_start',message:{role:'assistant',content:[],usage:{input_tokens:100,output_tokens:1}}},
    {type:'ping'},
    {type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}},
    {type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Analyse privée de test.'}},
    {type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signature-fixture'}},
    {type:'content_block_stop',index:0},
    {type:'content_block_start',index:1,content_block:{type:'server_tool_use',id:'recherche',name:'web_search',input:{}}},
    {type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"query":"Légi'}},
    {type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'france"}'}},
    {type:'content_block_stop',index:1},
    {type:'content_block_start',index:2,content_block:contenu},{type:'content_block_stop',index:2},
    {type:'content_block_start',index:3,content_block:{type:'text',text:''}},
    {type:'content_block_delta',index:3,delta:{type:'text_delta',text:'Une règle vérifiée.'}},
    {type:'content_block_delta',index:3,delta:{type:'citations_delta',citation}},
    {type:'content_block_stop',index:3},
    {type:'message_delta',delta:{stop_reason:'pause_turn'},usage:{output_tokens:40}},
    {type:'message_delta',delta:{stop_reason:'pause_turn'},usage:{input_tokens:200,output_tokens:50,server_tool_use:{web_search_requests:1}}},
    {type:'message_stop'}
  ]));
  assert.equal(r.content[0].signature,'signature-fixture');assert.equal(r.content[0].thinking,'Analyse privée de test.');
  assert.deepEqual(r.content[1].input,{query:'Légifrance'});assert.deepEqual(r.content[2],contenu);
  assert.equal(r.content[3].text,'Une règle vérifiée.');assert.deepEqual(r.content[3].citations,[citation]);
  assert.equal(r.stop_reason,'pause_turn');assert.deepEqual(r.usage,{input_tokens:200,output_tokens:50,server_tool_use:{web_search_requests:1}});
});
test('un flux incomplet ou une erreur explicite refuse toute réponse partielle',async()=>{
  const debut={type:'message_start',message:{content:[],usage:{input_tokens:1,output_tokens:0}}};
  await assert.rejects(lireReponse(flux([debut])),/reponse_incomplete/);
  await assert.rejects(lireReponse(flux([debut,{type:'error',error:{type:'overloaded_error'}}])),/modele_flux/);
});
test('la réponse JSON des autres requêtes reste prise en charge',async()=>{
  assert.deepEqual(await lireReponse(new Response('{"input_tokens":42}',{headers:{'Content-Type':'application/json'}})),{input_tokens:42});
});
