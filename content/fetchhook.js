!function(e){var t={};function n(o){if(t[o])return t[o].exports;var r=t[o]={i:o,l:!1,exports:{}};return e[o].call(r.exports,r,r.exports,n),r.l=!0,r.exports}n.m=e,n.c=t,n.d=function(e,t,o){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:o})},n.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},n.t=function(e,t){if(1&t&&(e=n(e)),8&t)return e;if(4&t&&"object"==typeof e&&e&&e.__esModule)return e;var o=Object.create(null);if(n.r(o),Object.defineProperty(o,"default",{enumerable:!0,value:e}),2&t&&"string"!=typeof e)for(var r in e)n.d(o,r,function(t){return e[t]}.bind(null,r));return o},n.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(t,"a",t),t},n.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},n.p="/dist",n(n.s=0)}([function(e,t,n){n(1)(window)},function(e,t){e.exports=function(e_outer){
    e_outer.hookFetch=function(hookCallbacks){
        if(null==window.RealFetch){
            if("function"!=typeof fetch) return !1;
            window.RealFetch=fetch;
        }
        window.fetch = async function(url, options){ 
            var originalUrl = url; 
            var modifiedUrl = url;
            var modifiedOptions = options; 

            if("function"==typeof hookCallbacks.urlHook){
                modifiedUrl = await hookCallbacks.urlHook.call(this, url); 
            }
            
            if("function"==typeof hookCallbacks.optionsHook){
                modifiedOptions = await hookCallbacks.optionsHook.call(this, options || {}, modifiedUrl); 
            }
            
            return window.RealFetch(modifiedUrl, modifiedOptions);
        }
    };
    e_outer.unHookFetch=function(){
        window.RealFetch&&(fetch=window.RealFetch),
        window.RealFetch=void 0
    }
}}]);