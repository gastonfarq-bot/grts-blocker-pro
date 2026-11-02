(function(){'use strict';const w=window;const noop=function(){};const _Q=w.apstag&&w.apstag._Q||[];
const apstag={_getSlotIdToNameMapping:noop,_Q:[],debug:noop,deleteId:noop,fetchBids:function(c,cb){if(typeof cb==='function'){cb([])}},init:noop,punt:noop,renderImp:noop,renewId:noop,setDisplayBids:noop,targetingKeys:function(){return[]},thirdPartyData:{},updateId:noop};
w.apstag=apstag;for(const i of _Q){try{apstag[i[0]].apply(apstag,i[1])}catch(e){}}})();
