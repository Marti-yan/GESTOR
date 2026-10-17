const PRECIFIC_URL='https://precific.martinscoders.com/';
function allowedPrecificUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&u.origin===new URL(PRECIFIC_URL).origin&&!u.username&&!u.password}catch{return false}}
function clampBounds(bounds,area){if(!bounds||!['x','y','width','height'].every(k=>Number.isFinite(bounds[k])))throw Error('Área do Precific inválida.');const x=Math.max(0,Math.min(Math.floor(bounds.x),Math.max(0,area.width-1))),y=Math.max(0,Math.min(Math.floor(bounds.y),Math.max(0,area.height-1)));return {x,y,width:Math.max(1,Math.min(Math.floor(bounds.width),area.width-x)),height:Math.max(1,Math.min(Math.floor(bounds.height),area.height-y))}}
class PrecificTab{
 constructor({window,WebContentsView,session,openExternal}){Object.assign(this,{window,View:WebContentsView,session,openExternal,view:null,attached:false,error:'',loading:false})}
 create(){if(this.view)return;const isolated=this.session.fromPartition('persist:pronto-precific');isolated.setPermissionRequestHandler((_c,_p,cb)=>cb(false));isolated.setPermissionCheckHandler(()=>false);this.view=new this.View({webPreferences:{session:isolated,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:false}});const c=this.view.webContents;
 c.setWindowOpenHandler(({url})=>{if(allowedPrecificUrl(url))c.loadURL(url).catch(()=>{});return {action:'deny'}});
 for(const event of ['will-navigate','will-redirect'])c.on(event,(e,url)=>{if(!allowedPrecificUrl(url)){e.preventDefault();this.error='Esse link abre outro endereço. Use Abrir no navegador para continuar.'}});
 c.on('did-start-loading',()=>{this.loading=true;this.error=''});c.on('did-stop-loading',()=>this.loading=false);c.on('did-fail-load',(_e,code,_d,_u,main)=>{if(main&&code!==-3){this.loading=false;this.error='Não foi possível carregar o Precific. Confira sua internet e tente atualizar.'}});c.on('render-process-gone',()=>{this.loading=false;this.error='A aba foi interrompida. Toque em Atualizar para reabri-la.'});c.loadURL(PRECIFIC_URL).catch(()=>{this.error='Não foi possível carregar o Precific. Confira sua internet e tente atualizar.'})}
 snapshot(){return {url:PRECIFIC_URL,loading:this.loading,error:this.error,visible:this.attached}}
 show(bounds){this.create();this.view.setBounds(clampBounds(bounds,this.window.getContentBounds()));if(!this.attached){this.window.contentView.addChildView(this.view);this.attached=true}return this.snapshot()}
 hide(){if(this.attached&&this.view){if(!this.window.isDestroyed?.())this.window.contentView.removeChildView(this.view);this.attached=false}return this.snapshot()}
 reload(){this.create();this.error='';this.view.webContents.reloadIgnoringCache();return this.snapshot()}
 async open(){await this.openExternal(PRECIFIC_URL);return this.snapshot()}
 destroy(){this.hide();if(this.view&&!this.view.webContents.isDestroyed())this.view.webContents.close();this.view=null}
}
module.exports={PrecificTab,PRECIFIC_URL,allowedPrecificUrl,clampBounds};
