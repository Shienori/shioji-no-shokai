import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const storage=new Map();let writes=0;
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{writes++;storage.set(key,String(value));},removeItem:key=>storage.delete(key)}});
let server;
try {
 server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
 const {useGameStore:store}=await server.ssrLoadModule('/src/state/gameStore.ts');
 const {debugSkipThirtyMinutes}=await server.ssrLoadModule('/src/state/debugTimeSkip.ts');
 const original=store.getState(),seed=structuredClone(original.gameState);let ticks=0;
 for(const phase of ['loading','sailing','unloading','completed']) {
  for(const plannedNavigation of [{modelVersion:'planned-voyage-v1'},null]) {
   const state={...seed,activeVoyage:{phase,plannedNavigation,departedRealTime:100,forecastEtaRealTime:200}};
   store.setState({gameState:state,selectedContractId:'keep-selection',tick:()=>{ticks++;}});
   const before=JSON.stringify(state),priorWrites=writes;
   assert.throws(()=>debugSkipThirtyMinutes(),/確定計画の航海中/);
   assert.equal(store.getState().gameState,state);assert.equal(JSON.stringify(state),before);
   assert.equal(store.getState().selectedContractId,'keep-selection');assert.equal(ticks,0);assert.equal(writes,priorWrites);
  }
 }
 store.setState({...original,gameState:{...seed,activeVoyage:null},tick:()=>{ticks++;}});
 debugSkipThirtyMinutes();assert.ok(ticks>=2);assert.equal(store.getState().selectedContractId,null);
 store.setState(original,true);
 console.log('Planned voyage legacy debug-skip guard assertions passed; normal planned navigation unchanged');
} finally {if(server)await server.close();if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
