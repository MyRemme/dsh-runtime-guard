// Native Harness module. Display state never enters the model's conversation.
window.__ModuleLoader__.load({
  id: 'dsh-runtime-guard',
  factory: require => {
    const React = require('react'), { createPortal } = require('react-dom');
    const UI = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement, PANEL = 'runtime-guard';
    const css = `
      .fs-root,.fs-dialog,.fs-toast{font:14px/22px "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif;letter-spacing:0;color:var(--dsw-alias-label-primary,#202020);box-sizing:border-box;overflow-wrap:anywhere;text-align:left}
      .fs-root *,.fs-dialog *,.fs-toast *{box-sizing:border-box;letter-spacing:0}.fs-root button,.fs-dialog button,.fs-toast button{font-family:inherit}.fs-root p{margin:0}.fs-root svg,.fs-dialog svg{flex:none;vertical-align:middle}
      .fs-mount{height:100%;min-height:0;min-width:0;width:100%;flex:1}.fs-mount[data-embedded=true]{height:min(720px,calc(100dvh - 96px));flex:none}.fs-surface{height:100%;min-height:0;width:100%}.fs-surface[data-fullscreen=true]{position:fixed;inset:0;z-index:1200;height:100dvh;background:var(--dsw-alias-bg-base,#fff)}
      .fs-root{--fs-accent:var(--dsw-alias-state-business-primary,#0067c0);--fs-line:var(--dsw-alias-border-l2,#e5e5e5);--fs-fill:var(--dsw-alias-interactive-bg-hover,#f5f5f5);height:100%;min-height:0;overflow:hidden;container:fs-panel / inline-size;background:var(--dsw-alias-bg-base,#fff)}.fs-page{width:100%;height:100%;min-height:0;display:flex;flex-direction:column}
      .fs-head,.fs-row,.fs-tools,.fs-state,.fs-event-head{display:flex;align-items:center;gap:8px;min-width:0}.fs-head{justify-content:space-between;gap:16px;flex-wrap:wrap}.fs-head h2{font-size:20px;line-height:28px;font-weight:500;margin:0}.fs-sub,.fs-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.fs-sub{margin:4px 0 0}.fs-tools{gap:4px;flex-wrap:wrap}.fs-state{font-size:12px;color:var(--dsw-alias-label-secondary)}
      .fs-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}.fs-state[data-tone=warn],.fs-warn{color:var(--dsw-alias-state-warn-primary)}.fs-state[data-tone=warn] .fs-dot{background:currentColor}.fs-state[data-tone=off]{color:var(--dsw-alias-label-tertiary)}.fs-state[data-tone=off] .fs-dot{background:currentColor}
      .fs-icon-button{width:28px!important;height:28px!important;padding:0!important;flex:none}.fs-action{height:28px;font-size:12px!important}.fs-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);margin-right:12px}
      .fs-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0;border-bottom:.5px solid var(--dsw-alias-border-l2)}.fs-stat{padding:8px 16px 12px;border-left:.5px solid var(--dsw-alias-border-l2)}.fs-stat:first-child{border-left:0;padding-left:0}.fs-stat dt{color:var(--dsw-alias-label-tertiary);font-size:12px}.fs-stat dd{font-size:22px;line-height:28px;font-weight:500;font-variant-numeric:tabular-nums;margin:2px 0 0}
      .fs-section h3{font-size:14px;line-height:22px;font-weight:500;margin:0}.fs-section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.fs-facts{margin:0}.fs-fact{display:flex;justify-content:space-between;align-items:baseline;gap:20px;padding:10px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}.fs-fact dt{color:var(--dsw-alias-label-secondary);flex:none}.fs-fact dd{margin:0;text-align:right;min-width:0}.fs-note{margin:10px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px}.fs-empty{padding:28px 0;color:var(--dsw-alias-label-tertiary);text-align:center;border-top:.5px solid var(--dsw-alias-border-l2)}
      .fs-events{list-style:none;padding:0;margin:0}.fs-event{padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}.fs-event-head{justify-content:space-between;align-items:baseline;gap:12px}.fs-event-title{font-weight:500;font-size:13px}.fs-event time{color:var(--dsw-alias-label-tertiary);font-size:11px;flex:none}.fs-event p{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.fs-event .fs-result{color:var(--dsw-alias-label-primary)}.fs-tag{font-size:11px;line-height:18px;padding:0 5px;border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);white-space:nowrap}.fs-error{color:var(--dsw-alias-state-error-primary);margin:0}.fs-test{color:var(--dsw-alias-state-success-primary);margin:0}
      .fs-dock{position:relative;min-width:0;max-width:100%;display:inline-flex}.fs-dock-button{font:11px/18px var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-tertiary);border:0;background:transparent;padding:2px 4px;border-radius:var(--dsw-radius-sm,4px);display:inline-flex;align-items:center;gap:5px;cursor:pointer;min-width:0;max-width:100%;white-space:nowrap}.fs-dock-button span{overflow:hidden;text-overflow:ellipsis}.fs-dock-button:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}.fs-dock-button[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}.fs-dialog{position:fixed;z-index:1100;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));box-shadow:var(--dsw-elevation-panel,0 6px 24px #0002);padding:16px;overflow:auto}.fs-dialog h3{margin:0;font-size:14px;font-weight:500}.fs-dialog .fs-head{flex-wrap:nowrap}.fs-dialog .fs-events{margin-top:8px}.fs-dialog .fs-event:last-child{border-bottom:0}.fs-dialog .fs-stats{margin-top:14px}.fs-dialog .fs-stat{padding:8px}.fs-dialog .fs-stat:first-child{padding-left:0}.fs-dialog .fs-stat dd{font-size:18px;line-height:24px}.fs-dialog .fs-fact{font-size:12px;gap:12px}
      .fs-toast{position:fixed;right:20px;bottom:20px;z-index:1000;width:min(360px,calc(100vw - 40px));padding:14px 16px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1));box-shadow:var(--dsw-elevation-panel,0 6px 24px #0002)}.fs-toast p{margin:5px 0 10px;font-size:12px;color:var(--dsw-alias-label-secondary)}.fs-summary{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .fs-root :focus-visible,.fs-dock-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.fs-icon{display:inline-flex;flex:none;position:relative}.fs-icon .fs-dot{position:absolute;right:0;top:0;border:1px solid var(--dsw-alias-bg-base)}
      .fs-tabs{display:flex;gap:24px;flex:none;border-bottom:1px solid var(--fs-line);overflow-x:auto;scrollbar-width:none}.fs-tab{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-height:40px;font:inherit;font-size:13px;white-space:nowrap;padding:6px 2px 12px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color 140ms}.fs-tab:hover{color:var(--dsw-alias-label-primary)}.fs-tab[aria-selected=true]{color:var(--fs-accent);font-weight:600}.fs-tab-marker{position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:2px;background:var(--fs-accent);animation:fs-marker 180ms ease-out}.fs-workspace{display:flex;flex:1;flex-direction:column;min-height:0;min-width:0;padding:24px 32px 14px;gap:18px}.fs-workspace>.fs-head,.fs-footer{width:100%;margin:0}.fs-workspace>.fs-head{flex-wrap:nowrap;align-items:center;flex:none}.fs-head .fs-title{min-width:0;flex:1;display:flex;align-items:center;gap:10px}.fs-head .fs-title>svg{color:var(--fs-accent)}.fs-head h2{font-size:20px;line-height:28px;font-weight:600}.fs-header-tools{flex-wrap:nowrap;gap:2px}.fs-header-tools .fs-switch{margin-right:12px;white-space:nowrap;font-size:12px}.fs-root .fs-icon-button{width:30px!important;height:30px!important;border-radius:4px}.fs-root .fs-action{height:32px;font-size:13px!important;padding:4px 12px;border:1px solid var(--fs-line);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:4px}
      .fs-tabpanel{flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;animation:fs-page-in 220ms cubic-bezier(.16,1,.3,1)}.fs-tabpanel[data-view=monitor]{overflow:hidden;display:flex;flex-direction:column;gap:22px;width:100%;scrollbar-gutter:auto}.fs-settings{display:flex;flex-direction:column;gap:28px;width:100%;padding:2px 0 24px}.fs-monitor{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:28px;flex:1;min-height:0}.fs-monitor-section{display:flex;flex-direction:column;min-height:0;min-width:0}.fs-monitor-section+.fs-monitor-section{border-left:1px solid var(--fs-line);padding-left:28px}.fs-monitor-section>.fs-section-head{flex:none;margin-bottom:12px;min-height:24px}.fs-section h3{font-size:14px;line-height:22px;font-weight:600}.fs-monitor-section .fs-health-note{flex:none;font-size:12px;line-height:18px;margin:10px 0 0}.fs-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}.fs-root :is(.fs-scroll,.fs-tabpanel,.fs-section-scroll,.fs-model-list){scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l3,#ccc) transparent}.fs-search{position:relative;margin-bottom:12px;flex:none}.fs-search input{width:100%;height:34px;padding:5px 10px 5px 32px;border:1px solid var(--fs-line);border-bottom-color:var(--dsw-alias-border-l3,#aaa);border-radius:4px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit;font-size:13px}.fs-search input:focus-visible{outline:0;border-bottom:2px solid var(--fs-accent)}.fs-search-icon{position:absolute;left:10px;top:10px;display:flex;color:var(--dsw-alias-label-tertiary)}.fs-filter{margin-bottom:8px;display:flex;align-items:center;gap:8px;min-width:0}.fs-filter>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.fs-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;font-size:12px;line-height:18px;padding-top:10px;border-top:1px solid var(--fs-line)}.fs-section-scroll{max-height:280px;overflow:auto;overscroll-behavior:contain}.fs-root .fs-error,.fs-root .fs-test{font-size:13px;line-height:20px}
      .fs-dialog,.fs-toast{background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent,0 6px 24px #0002)}
      .fs-conversations{border-top:1px solid var(--fs-line)}.fs-conversation{padding:12px 8px;border-bottom:1px solid var(--fs-line);min-width:0;transition:background 140ms}.fs-conversation:hover{background:var(--fs-fill)}.fs-conversation-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px}.fs-conversation-main{min-width:0;flex:1}.fs-conversation-title{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-conversation .fs-tools{flex:none;flex-wrap:nowrap;gap:0}.fs-conversation .fs-icon-button{width:26px!important;height:26px!important}.fs-conversation .fs-state{font-size:12px}.fs-conversation-meta{display:flex;flex-wrap:wrap;gap:2px 12px;margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums}.fs-root details{margin-top:6px}.fs-root summary{width:fit-content;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;transition:color 140ms}.fs-root summary:hover{color:var(--fs-accent)}.fs-root details[open]>.fs-detail-body{animation:fs-detail-in 160ms ease-out}.fs-live{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.fs-event-context{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;min-width:0}.fs-event-context .fs-link{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.fs-link{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;padding:0;text-align:left;cursor:pointer}.fs-link:disabled{color:var(--dsw-alias-label-secondary);cursor:default}.fs-health-note{margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .fs-model-modes{display:flex;flex-wrap:wrap;min-width:0;gap:18px;border:0;padding:0;margin:12px 0}.fs-model-modes label,.fs-model-option{display:flex;align-items:center;gap:8px}.fs-model-list{max-height:260px;overflow:auto;border-top:.5px solid var(--dsw-alias-border-l2);margin:12px 0}.fs-model-option{padding:8px 0;cursor:pointer}.fs-model-option span{min-width:0;overflow-wrap:anywhere}.fs-model-option small{display:block;color:var(--dsw-alias-label-tertiary)}.fs-model-option input,.fs-model-modes input{flex-shrink:0;accent-color:var(--dsw-alias-state-business-primary)}.fs-model-search{box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;color:inherit;font:inherit}
      .fs-root .fs-stats{padding:0 0 18px;flex:none}.fs-root .fs-stat{padding:0 20px;border-left:1px solid var(--fs-line)}.fs-root .fs-stat:first-child{padding-left:0;border-left:0}.fs-root .fs-stat dt{font-size:12px;line-height:20px}.fs-root .fs-stat dd{font-size:28px;line-height:36px;font-weight:600;margin-top:3px}.fs-root .fs-event{padding:14px 8px;border-bottom:1px solid var(--fs-line)}.fs-root .fs-event:first-child{padding-top:8px}.fs-root .fs-event-title{font-size:13px;line-height:22px;font-weight:600}.fs-root .fs-event p{margin-top:7px;font-size:13px;line-height:21px}.fs-root .fs-event time{font-size:12px;line-height:20px}.fs-root .fs-event-head{align-items:flex-start;flex-wrap:wrap;gap:0 12px}.fs-root .fs-event .fs-result{color:var(--dsw-alias-label-secondary)}.fs-root .fs-tag{font-size:12px;padding:1px 6px}.fs-root .fs-note{margin:10px 0 0;font-size:12px;line-height:20px}.fs-root .fs-section-head{margin-bottom:14px}.fs-root .fs-facts{border-top:1px solid var(--fs-line)}.fs-root .fs-fact{display:grid;grid-template-columns:150px minmax(0,1fr);align-items:center;gap:24px;min-height:52px;padding:14px 4px;border-bottom:1px solid var(--fs-line);font-size:14px;line-height:22px}.fs-root .fs-fact dt{font-weight:400}.fs-root .fs-fact dd{text-align:right}.fs-root .fs-rules .fs-fact{grid-template-columns:126px minmax(0,1fr);align-items:start;padding:16px 4px}.fs-root .fs-rules dd{text-align:left;font-size:13px;color:var(--dsw-alias-label-secondary)}.fs-setting-row{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:64px;padding:12px 4px;border-block:1px solid var(--fs-line)}.fs-setting-copy{min-width:0}.fs-setting-copy strong{display:block;font-size:14px;font-weight:500}.fs-setting-copy small{display:block;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);margin-top:2px}.fs-settings .fs-section-head+.fs-note{margin-top:0}.fs-settings .fs-section>.fs-facts,.fs-settings .fs-section>.fs-model-modes{margin-top:16px}.fs-settings .fs-facts+.fs-note{margin-top:12px}.fs-settings .fs-model-modes{gap:4px;padding:4px;background:var(--fs-fill);border-radius:6px;width:fit-content;max-width:100%}.fs-settings .fs-model-modes label{position:relative;padding:6px 14px;min-height:34px;border-radius:4px;cursor:pointer;font-size:13px;transition:background 140ms,box-shadow 140ms}.fs-settings .fs-model-modes label:has(:checked){background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 3px #0001;color:var(--fs-accent)}.fs-settings .fs-model-modes label:has(:disabled){opacity:.5;cursor:default}.fs-settings .fs-model-modes input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:inherit}.fs-settings .fs-model-modes label:has(:focus-visible){outline:2px solid var(--fs-accent);outline-offset:2px}.fs-settings .fs-model-option{padding:12px 8px;border-bottom:1px solid var(--fs-line);transition:background 140ms}.fs-settings .fs-model-option:hover{background:var(--fs-fill)}.fs-settings .fs-model-option input{width:17px;height:17px;margin-right:6px}.fs-settings .fs-model-search{height:36px;font-size:13px}.fs-setting-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px}.fs-records{margin-top:26px}.fs-records h3{margin-bottom:12px}.fs-about{display:flex;align-items:center;gap:16px;padding:6px 0 24px;color:var(--fs-accent)}.fs-about strong{display:block;font-size:20px;line-height:28px;color:var(--dsw-alias-label-primary);font-weight:600}.fs-about small{display:block;font-size:13px;color:var(--dsw-alias-label-tertiary);margin-top:4px}.fs-root button{transition:background 140ms,color 140ms,opacity 140ms,transform 100ms}.fs-root button:active:not(:disabled){transform:scale(.97)}.fs-surface[data-fullscreen=true] .fs-root{animation:fs-expand 200ms cubic-bezier(.16,1,.3,1)}
      @keyframes fs-page-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes fs-detail-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}@keyframes fs-marker{from{transform:scaleY(.3);opacity:.3}to{transform:scaleY(1);opacity:1}}@keyframes fs-expand{from{opacity:.6;transform:scale(.99)}to{opacity:1;transform:scale(1)}}
      @container fs-panel (max-width:1050px){.fs-workspace{padding:20px 24px 12px;gap:16px}.fs-header-tools .fs-switch{margin-right:4px}.fs-monitor{gap:20px}.fs-monitor-section+.fs-monitor-section{padding-left:20px}}
      @container fs-panel (max-width:860px){.fs-tabs{gap:20px}.fs-workspace{padding:18px 24px 12px;gap:16px}.fs-header-tools .fs-switch{margin-right:8px}.fs-monitor{grid-template-columns:minmax(0,1fr);gap:16px}.fs-monitor-section+.fs-monitor-section{border-left:0;padding-left:0}.fs-tabpanel[data-view=monitor]{gap:18px}.fs-root .fs-stat dd{font-size:24px;line-height:30px}.fs-root .fs-fact{grid-template-columns:130px minmax(0,1fr);gap:16px}.fs-root .fs-rules .fs-fact{grid-template-columns:112px minmax(0,1fr)}}
      @container fs-panel (max-width:520px){.fs-tabs{gap:0;justify-content:space-between}.fs-tab{padding:6px 2px 10px;font-size:12px;gap:5px;min-height:36px}.fs-tab svg{width:14px;height:14px}.fs-workspace{padding:16px 14px 10px;gap:14px}.fs-workspace>.fs-head{flex-wrap:wrap;gap:10px}.fs-head h2{font-size:18px;line-height:26px}.fs-header-tools{width:100%;justify-content:flex-end}.fs-header-tools .fs-switch{margin-right:auto}.fs-root .fs-conversation-meta{gap:1px 8px}.fs-root .fs-fact{grid-template-columns:100px minmax(0,1fr);gap:12px;font-size:13px}.fs-root .fs-rules .fs-fact{grid-template-columns:minmax(0,1fr);gap:6px}.fs-root .fs-rules dt{font-weight:600}.fs-root .fs-event-head{gap:0 8px}.fs-settings{gap:24px}.fs-footer{font-size:12px;flex-wrap:wrap;gap:2px 8px;padding-top:8px}.fs-footer time{font-size:11px}.fs-settings .fs-model-modes label{padding:6px 10px}.fs-about strong{font-size:18px}.fs-root .fs-section-head{margin-bottom:10px}.fs-tabpanel[data-view=monitor]{gap:14px}.fs-monitor{gap:14px}.fs-root .fs-event{padding:10px 4px}.fs-root .fs-conversation{padding:10px 4px}}
      @media(max-width:560px){.fs-dialog .fs-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.fs-dialog .fs-stat:nth-child(3){border-left:0;padding-left:0}.fs-dialog .fs-stat:nth-child(n+3){border-top:.5px solid var(--dsw-alias-border-l2)}}
      @media(prefers-reduced-motion:reduce){.fs-root *,.fs-surface[data-fullscreen=true] .fs-root{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
      .fs-setting-row .fs-model-modes{margin:0;flex:none}.fs-settings .fs-setting-row+.fs-facts{border-top:0;margin-top:0}.fs-monitor-modes{display:none}
      @container fs-panel (max-width:860px){.fs-monitor-modes{display:flex;gap:4px;flex:none;background:var(--fs-fill);padding:3px;border-radius:6px}.fs-monitor-modes button{flex:1;min-height:30px;padding:4px 10px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer}.fs-monitor-modes button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--fs-accent);box-shadow:0 1px 3px #0001}.fs-monitor{grid-template-rows:minmax(0,1fr)}.fs-monitor[data-pane=conversations]>.fs-monitor-section:last-child,.fs-monitor[data-pane=events]>.fs-monitor-section:first-child{display:none}}
      @container fs-panel (max-width:520px){.fs-tab{justify-content:center}.fs-setting-row:has(.fs-model-modes){flex-wrap:wrap;gap:10px}}
      .fs-root .fs-stats{gap:10px;padding:0;border-bottom:0}.fs-root .fs-stat,.fs-root .fs-stat:first-child{padding:12px 16px;border:1px solid var(--fs-line);border-radius:6px;background:color-mix(in srgb,var(--fs-fill) 70%,var(--dsw-alias-bg-base,#fff))}.fs-root .fs-stat dd{font-size:24px;line-height:32px;margin-top:4px}.fs-monitor .fs-scroll>.fs-empty{border-top:0;min-height:160px;display:flex;align-items:center;justify-content:center}.fs-records .fs-stats{margin-bottom:12px}
      @container fs-panel (max-width:520px){.fs-root .fs-stats{gap:6px}.fs-root .fs-stat,.fs-root .fs-stat:first-child{padding:9px 8px}.fs-root .fs-stat dt{font-size:11px;line-height:17px}.fs-root .fs-stat dd{font-size:22px;line-height:28px}}
    `;
    const labels = {
      'correction-deferred': ['等待纠正', '当前回合结束后提交纠正；本次输出未中断。'],
      'recovery-submitted': ['已提交纠正', '已开启独立纠正回合，恢复效果待确认。'],
      'budget-exhausted': ['纠正次数已用完', '已达到本任务的纠正上限，没有追加模型请求。'],
      'user-input-takes-priority': ['用户输入优先', '已有待处理输入，未自动停止或追加纠正回合，由宿主继续处理输入。'],
      'intervention-unavailable': ['纠正不可用', '当前宿主或模式不支持该动作，未中断输出。'],
      'recovery-failed': ['纠正提交失败', '没有确认纠正成功，请检查当前对话。'],
      'cancel-requested': ['已请求中断', '已向宿主请求停止本次重复响应；不等于宿主已确认停止。'],
      'stop-confirmed': ['已停止重复生成', '宿主已记录本轮因防护而停止；未自动重试或重放工具。'],
      'stop-unconfirmed': ['停止结果未确认', '已结束跟踪，但没有收到属于本插件的停止确认。'],
      'stop-failed': ['停止请求失败', '宿主未接受停止请求，请检查当前对话。'],
      'correction-revoked': ['已撤销纠正', '监控关闭、请求中止或会话结束，待执行纠正已撤销。'],
    };
    const time = value => value ? new Date(value).toLocaleString() : '尚无';
    const modeName = mode => mode === 'guard' ? '防护停止' : mode === 'assist' ? '有限纠正' : '仅观察';
    function health(data) {
      if (data.tracked === false) return { label: '仅保留历史记录', tone: 'off' };
      const excluded = { paused: '监控已暂停', disabled: '此对话未启用', 'other-model': '当前模型不在监控范围', auxiliary: '辅助请求未监控', unavailable: data.live?.incompleteReason === 'monitor-error' ? '检测异常 · 仅传递输出' : '检测不完整 · 待下次请求', waiting: '待下次模型请求' };
      const live = data.live, latest = data.latestEvent;
      if (data.coverage !== 'unavailable' && excluded[data.coverage]) return { label: excluded[data.coverage], tone: 'off' };
      if (live?.incompleteReason === 'monitor-error' || latest?.kind === 'internal-error') return { label: '检测异常 · 仅传递输出', tone: 'off' };
      if (data.coverage === 'unavailable' && latest?.kind === 'recovery') return { label: labels[latest.action]?.[0] || '处理状态已更新', tone: 'warn' };
      if (data.coverage === 'unavailable' && (live?.risk === 'confirmed' || latest?.kind === 'stream-repeat' && latest.confirmed)) return { label: '确认重复 · 请求已结束', tone: 'warn' };
      if (excluded[data.coverage]) return { label: excluded[data.coverage], tone: 'off' };
      if (latest?.kind === 'recovery') return { label: labels[latest.action]?.[0] || '处理状态已更新', tone: 'warn' };
      if (live?.evidence?.uncertainty || latest?.uncertainty && live?.risk !== 'clear') return { label: '无法确认空转 · 已通知', tone: 'warn' };
      if (live?.risk === 'confirmed' || (!live && latest?.kind === 'stream-repeat' && latest.confirmed)) return { label: '确认重复 · 未中断', tone: 'warn' };
      if (live?.risk === 'suspected' || (!live && latest?.kind === 'stream-repeat')) return { label: '疑似重复 · 观察中', tone: 'warn' };
      if (live?.incomplete) return { label: live.incompleteReason === 'fence-limit' ? '检测不完整 · 围栏候选行超限' : '检测不完整 · 内容块超限', tone: 'off' };
      if (live?.active && live.silentForMs >= 30000) return { label: '等待输出 · 尚不能判断', tone: 'warn' };
      if (latest?.kind === 'tool-repeat') return { label: '工具重复 · 仅提醒', tone: 'warn' };
      if (data.coverage === 'monitoring') return { label: !live ? '正在监控' : live.checks ? '持续检测 · 暂未发现循环' : live.reasoningChars + live.textChars ? '接收输出 · 积累检测样本' : '等待模型首个输出', tone: 'on' };
      return { label: live && !live.checks ? '请求结束 · 检测样本不足' : '最近请求 · 未发现重复', tone: live && !live.checks ? 'off' : 'on' };
    }
    function explain(event, mode) {
      if (event.kind === 'stream-repeat') return {
        title: event.uncertainty ? '重复特征待确认' : event.confirmed ? `确认${event.contentType === 'text' ? '正文' : event.contentType === 'reasoning' ? '推理' : '输出'}重复` : '疑似重复',
        reason: `检测到${event.method === 'phrase' ? '夹杂变化文字的短句反复出现' : '周期性短句轮转'}${event.period ? `，周期 ${event.period} 字符` : ''}${event.repeats ? `、重复 ${event.repeats} 次` : ''}${event.coverage === undefined ? '' : `，${event.method === 'phrase' ? '短句单元占比' : '窗口覆盖'} ${Math.round(event.coverage * 100)}%`}${event.novelty === undefined ? '' : `，新增四字符片段 ${Math.round(event.novelty * 100)}%`}。${event.confirmed ? '连续多次检查通过重复确认。' : '尚未达到连续确认条件。'}`,
        result: event.uncertainty ? `${event.uncertainty === 'changing-units' ? '重复短句间的对象或内容仍在变化' : '重复短句间仍有变化编号'}，可能是逐项检查，无法确认是否空转。已通知你，未自动停止或提交纠正，继续监测。`
          : event.confirmed && mode === 'guard' && event.contentType === 'reasoning' ? '已确认推理重复；停止请求和宿主确认见后续处理记录。'
          : event.confirmed && mode === 'assist' ? '仅确认重复；纠正是否排队或提交见后续处理记录。本次输出未中断。' : '仅告警，未拦截、未中断输出。',
      };
      if (event.kind === 'tool-repeat') return { title: '工具重复告警', reason: `相同工具、参数及结果${event.repeats ? `连续出现 ${event.repeats} 次` : '重复出现'}，可能没有新增进展。`, result: '仅提醒，未阻止、跳过或重放任何工具。' };
      if (event.kind === 'recovery') return { title: labels[event.action]?.[0] || '纠正状态变更', reason: '此前检测到连续重复推理或正文。', result: labels[event.action]?.[1] || '请查看后续记录确认实际处理结果。' };
      return { title: event.kind === 'internal-error' ? '监控异常' : '监控已启动', reason: '', result: event.kind === 'internal-error' ? '当前检测可能不完整，模型输出继续传递。' : '观察模式已就绪。' };
    }
    function createController(ctx) {
      let state = { data: null, conversations: [], conversationError: '', sessions: Object.create(null), sessionErrors: Object.create(null), error: '', busy: false, test: '', toast: null, updatedAt: null, updates: null, updateError: '', updateBusy: false, modelScope: null, scopeError: '', scopeReadError: '', scopeLoading: false };
      const listeners = new Set(), requests = new Set(), downloads = new Map(), watched = new Map(), pendingSessions = new Set();
      let disposed = false, polling = false, listing = false, generation = 0, lastNotice = '';
      const publish = patch => { if (!disposed) { state = { ...state, ...patch }; for (const fn of listeners) fn(); } };
      async function call(endpoint, payload = {}) {
        const controller = new AbortController(); requests.add(controller);
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const result = await ctx.connection.rpc.call('/runtime-guard', endpoint, payload, controller.signal);
          if (!result?.ok) throw new Error('Host operation unavailable');
          return result.value;
        } finally { clearTimeout(timer); requests.delete(controller); }
      }
      function accept(data) {
        const event = data.events.find(e => e.kind === 'internal-error' || e.kind === 'tool-repeat' || (e.kind === 'stream-repeat' && (e.confirmed || e.uncertainty)) || (e.kind === 'recovery' && e.action === 'recovery-submitted'));
        const id = event ? `${event.session}/${event.time}/${event.kind}/${event.contentType || ''}/${event.action || ''}/${event.repeats || ''}` : '';
        const patch = { data, error: '', updatedAt: new Date().toISOString() };
        if (id && id !== lastNotice) { patch.toast = event; lastNotice = id; }
        publish(patch);
      }
      async function refreshSession(id) {
        if (disposed || state.busy || pendingSessions.has(id)) return;
        const current = generation; pendingSessions.add(id);
        try {
          const value = await call('session', { sessionId: id });
          if (generation === current && watched.has(id)) publish({ sessions: { ...state.sessions, [id]: value }, sessionErrors: { ...state.sessionErrors, [id]: '' } });
        } catch { if (generation === current && watched.has(id)) publish({ sessionErrors: { ...state.sessionErrors, [id]: '会话监控未连接' } }); }
        finally { pendingSessions.delete(id); if (current !== generation && watched.has(id)) void refreshSession(id); }
      }
      async function refresh() {
        if (polling || disposed || state.busy) return;
        polling = true; const current = generation;
        try { const data = await call('snapshot'); if (generation === current) accept(data); }
        catch { if (generation === current) publish({ error: '监控服务未连接' }); }
        finally { polling = false; if (current !== generation) void refresh(); }
      }
      async function refreshConversations() {
        if (disposed || listing || state.busy) return;
        listing = true; const current = generation;
        try { const value = await call('conversations'); if (generation === current) publish({ conversations: Array.isArray(value) ? value : [], conversationError: '' }); }
        catch { if (generation === current) publish({ conversationError: '对话列表未连接，请刷新重试。' }); }
        finally { listing = false; if (current !== generation) void refreshConversations(); }
      }
      let scopePolling = false;
      async function refreshScope(catalog = false) {
        if (disposed || scopePolling || state.busy) return;
        scopePolling = true; const current = generation;
        if (catalog) publish({ scopeLoading: true });
        try {
          const value = await call(catalog ? 'refreshModels' : 'modelScope');
          if (current === generation && ['all', 'selected'].includes(value?.scope) && Array.isArray(value.selections)) publish({ modelScope: value, scopeReadError: '' });
        } catch { if (current === generation) publish({ scopeReadError: '监控范围未同步，请重试。' }); }
        finally {
          scopePolling = false; if (catalog) publish({ scopeLoading: false });
          if (current !== generation) void refreshScope();
        }
      }
      let updatePolling = false, updateGeneration = 0;
      async function refreshUpdates() {
        if (disposed || updatePolling || state.updateBusy) return;
        updatePolling = true; const current = updateGeneration;
        try { const value = await call('updates'); if (current === updateGeneration && value && typeof value.currentVersion === 'string') publish({ updates: value, updateError: '' }); }
        catch { if (current === updateGeneration) publish({ updateError: '更新服务未连接' }); }
        finally {
          updatePolling = false;
          // A stale in-flight poll may have blocked the post-action refresh.
          if (current !== updateGeneration) void refreshUpdates();
        }
      }
      async function updateAction(endpoint, payload) {
        if (disposed || state.updateBusy) return;
        updateGeneration++; publish({ updateBusy: true, updateError: '' });
        try { publish({ updates: await call(endpoint, payload) }); }
        catch { publish({ updateError: '更新操作未完成，请检查状态后重试。' }); }
        finally { updateGeneration++; publish({ updateBusy: false }); void refreshUpdates(); }
      }
      async function poll() { await Promise.all([refresh(), refreshConversations(), refreshUpdates(), refreshScope(), ...[...watched.keys()].map(refreshSession)]); }
      async function action(endpoint, payload) {
        if (state.busy || disposed) return;
        generation++; publish({ busy: true, error: '' });
        try {
          const value = await call(endpoint, payload);
          if (disposed) return;
          if (endpoint === 'setMonitoring' || endpoint === 'setMode') accept(value);
          if (endpoint === 'setOperationSafety') publish({ data: state.data ? { ...state.data, operationSafety: value } : null, safetyError: '' });
          if (endpoint === 'setSessionEnabled' && payload?.sessionId && watched.has(payload.sessionId)) {
            publish({ sessions: { ...state.sessions, [payload.sessionId]: value }, sessionErrors: { ...state.sessionErrors, [payload.sessionId]: '' } });
          }
          if (endpoint === 'setModelScope') publish({ modelScope: value, scopeError: '' });
          if (endpoint === 'selfTest') publish({ test: value.passed && value.modelRequests === 0 ? '离线自检通过，未调用模型，未计入真实告警。' : '离线自检未通过。' });
          if (endpoint === 'export') {
            const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
            if (downloads.size >= 10) { const [old, timer] = downloads.entries().next().value; clearTimeout(timer); URL.revokeObjectURL(old); downloads.delete(old); }
            downloads.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60000));
            const a = document.createElement('a'); a.href = url; a.download = 'runtime-guard-diagnostics.json'; document.body.appendChild(a); a.click(); a.remove();
          }
        } catch { publish(endpoint === 'setOperationSafety' ? { safetyError: '操作防护设置保存失败，原设置仍然生效。请重试。' } : endpoint === 'setModelScope' ? { scopeError: '范围保存失败，原设置仍然生效。请重试。' } : { error: '操作未完成，请重试。' }); }
        finally { generation++; publish({ busy: false }); void refresh(); void refreshScope(); refreshConversations(); for (const id of watched.keys()) refreshSession(id); }
      }
      const onVisibility = () => { if (document.visibilityState !== 'hidden' && !disposed) void poll(); };
      document.addEventListener?.('visibilitychange', onVisibility);
      const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void poll(); }, 2000); poll();
      return {
        subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, snapshot: () => state, refresh: poll, refreshModels: () => refreshScope(true), action, updateAction,
        watch: id => { watched.set(id, (watched.get(id) || 0) + 1); refreshSession(id); return () => { const count = watched.get(id) - 1; if (count) watched.set(id, count); else { watched.delete(id); const { [id]: _old, ...sessions } = state.sessions; const { [id]: _error, ...sessionErrors } = state.sessionErrors; publish({ sessions, sessionErrors }); } }; },
        dismiss: () => publish({ toast: null }),
        dispose: () => { disposed = true; clearInterval(timer); document.removeEventListener?.('visibilitychange', onVisibility); for (const request of requests) request.abort(); for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); } downloads.clear(); watched.clear(); listeners.clear(); },
      };
    }
    function apply(ctx) {
      const tag = document.createElement('style'); tag.dataset.pluginCss = 'dsh-runtime-guard'; tag.textContent = css; document.head.appendChild(tag);
      const controller = createController(ctx); ctx.effect(() => () => { controller.dispose(); tag.remove(); });
      const useState = () => React.useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
      const icon = (Component, size = 14) => Component ? h(Component, { size, 'aria-hidden': true }) : null;
      const command = (label, onClick, Icon, disabled, onlyIcon = false) => h(UI.Button, { type: 'button', variant: 'ghost', size: 'sm', className: onlyIcon ? 'fs-icon-button' : 'fs-action', title: label, 'aria-label': label, onClick, disabled, icon: icon(Icon) }, onlyIcon ? null : label);
      const status = (text, tone = 'on') => h('span', { className: 'fs-state', 'data-tone': tone }, h('i', { className: 'fs-dot', 'aria-hidden': true }), text);
      const stat = (label, value) => h('div', { className: 'fs-stat', key: label }, h('dt', null, label), h('dd', null, value));
      const fact = (label, value) => h('div', { className: 'fs-fact', key: label }, h('dt', null, label), h('dd', null, value));
      const service = name => ctx.get?.(name) ?? ctx[name];
      function conversationName(item) {
        const row = service('sessions')?.list?.getSnapshot?.().byId?.[item.sessionId];
        const title = typeof row?.title === 'string' && row.title.trim() ? row.title : null;
        return title ? `${title} · ${item.sessionKey.slice(0, 6)}` : `对话 ${item.sessionKey.slice(0, 8)}`;
      }
      const openConversation = item => service('uiWorkspace')?.openSession?.(item.sessionId);
      function Live({ data }) {
        const live = data.live;
        return h(React.Fragment, null,
          h('div', { className: 'fs-live' }, h('span', null, `第 ${live?.turn ?? data.turn ?? 0} 轮 · 步骤 ${live?.step ?? data.step ?? 0}`),
            live && h('span', null, `推理 ${live.reasoningChars.toLocaleString()} 字符`), live && h('span', null, `正文 ${live.textChars.toLocaleString()} 字符`),
            live && h('span', null, `已检查 ${live.checks} 次`), live && h('span', null, `检测文本 ${live.analyzedChars ?? 0} 字符`), h('span', null, `工具结果 ${data.toolResults ?? 0} 次`)),
          live && h('div', { className: 'fs-live' }, h('span', null, `最近输出 ${time(live.lastOutputAt)}`),
            h('span', null, `最近检测 ${time(live.lastCheckAt)}`), live.active && h('span', null, `等待新输出 ${Math.floor(live.silentForMs / 1000)} 秒`)));
      }
      function Events({ events, mode, conversations = [] }) {
        return h('ol', { className: 'fs-events' }, events.map((event, i) => {
          const text = explain(event, mode);
          return h('li', { className: 'fs-event', key: `${event.session}/${event.time}/${i}` },
            h('div', { className: 'fs-event-head' }, h('span', { className: 'fs-event-title' }, text.title), h('time', null, time(event.time))),
            h('div', { className: 'fs-event-context' }, event.session && (() => { const item = conversations.find(item => item.sessionKey === event.session); return h('button', { type: 'button', className: 'fs-link', disabled: !item || !service('uiWorkspace')?.openSession, onClick: () => openConversation(item) }, item ? conversationName(item) : `对话 ${event.session.slice(0, 8)}`); })(),
              event.turn !== undefined && h('span', { className: 'fs-tag' }, `第 ${event.turn} 轮${event.step === undefined ? '' : ` · 步骤 ${event.step}`}`)),
            h('p', { className: 'fs-result' }, text.result), text.reason && h('details', null, h('summary', null, '检测依据'), h('div', { className: 'fs-detail-body' }, h('p', null, text.reason))));
        }));
      }
      function Panel({ view, embedded = false } = {}) {
        const state = useState(), data = state.data, online = data && !state.error;
        const [filter, setFilter] = React.useState(''), [tab, setTab] = React.useState('monitor'), [query, setQuery] = React.useState(''), [pane, setPane] = React.useState('conversations');
        const [fullscreen, setFullscreen] = React.useState(false);
        const mount = React.useRef(null), restoreFocus = React.useRef(null), eventRegion = React.useRef(null), id = React.useId();
        const [surface] = React.useState(() => { const node = document.createElement('div'); node.className = 'fs-surface'; return node; });
        React.useEffect(() => service('sessions')?.list?.subscribe?.(() => controller.refresh()), []);
        React.useLayoutEffect(() => { if (eventRegion.current) eventRegion.current.scrollTop = 0; }, [filter]);
        React.useLayoutEffect(() => {
          if (view === 'summary') { surface.remove(); return; }
          const previous = document.activeElement;
          const scrollPositions = [...surface.querySelectorAll('.fs-scroll,.fs-tabpanel,.fs-section-scroll,.fs-model-list')].map(node => [node, node.scrollTop]);
          const restoreScroll = () => scrollPositions.forEach(([node, top]) => { node.scrollTop = top; });
          (fullscreen ? document.body : mount.current)?.appendChild(surface);
          surface.dataset.fullscreen = String(fullscreen);
          if (!fullscreen) { restoreFocus.current?.focus({ preventScroll: true }); restoreFocus.current = null; restoreScroll(); return; }
          const overflow = document.body.style.overflow;
          const background = [...document.body.children].filter(node => node !== surface);
          const inert = background.map(node => node.hasAttribute('inert'));
          background.forEach(node => node.setAttribute('inert', ''));
          document.body.style.overflow = 'hidden';
          surface.querySelector('[aria-label="退出全屏"]')?.focus({ preventScroll: true });
          restoreScroll();
          const onKey = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setFullscreen(false); }
            if (event.key !== 'Tab') return;
            const targets = [...surface.querySelectorAll('button:not(:disabled):not([tabindex="-1"]),input:not(:disabled),a[href],summary,[tabindex="0"]')].filter(node => {
              if (node.closest('[hidden]') || node.closest('details:not([open]) > :not(summary)')) return false;
              for (let parent = node; parent && parent !== surface; parent = parent.parentElement) if (window.getComputedStyle(parent).display === 'none') return false;
              return true;
            });
            const first = targets[0], last = targets[targets.length - 1];
            if (event.shiftKey && (document.activeElement === first || !surface.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !surface.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
          };
          document.addEventListener('keydown', onKey, true);
          return () => {
            document.removeEventListener('keydown', onKey, true);
            background.forEach((node, index) => { if (!inert[index]) node.removeAttribute('inert'); });
            document.body.style.overflow = overflow;
            restoreFocus.current = previous;
            if (!mount.current && previous?.isConnected) previous.focus({ preventScroll: true });
          };
        }, [fullscreen, view]);
        React.useEffect(() => () => surface.remove(), []);
        const label = !online ? (state.error || '连接中') : data.monitoring ? '监控在线' : '监控已暂停';
        if (view === 'summary') return h('div', { className: 'fs-summary' }, status(label, online && data.monitoring ? 'on' : 'off'), data && `已监控 ${data.monitoredRequests} 次 · 确认重复 ${data.confirmed} 次`);
        const events = data?.events.filter(e => e.kind !== 'compatibility' && (!filter || e.session === filter)) || [];
        const tabs = [['monitor', '实时监控', UI.IconGaugeOutlineRegular], ['safety', '操作防护', UI.IconShieldOutlineRegular], ['settings', '监控设置', UI.IconSettingsOutlineRegular], ['updates', '插件更新', UI.IconDownloadOutlineRegular]];
        const visible = state.conversations.filter(item => `${conversationName(item)} ${item.sessionKey}`.toLowerCase().includes(query.trim().toLowerCase()));
        const onTabKey = event => {
          const index = tabs.findIndex(([key]) => key === tab);
          const next = ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % tabs.length : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setTab(tabs[next][0]); surface.querySelector(`[id="${id}-${tabs[next][0]}"]`)?.focus();
        };
        const content = h('section', { className: 'fs-root', role: fullscreen ? 'dialog' : undefined, 'aria-modal': fullscreen ? true : undefined, 'aria-label': '运行时护栏监控面板' }, h('div', { className: 'fs-page' },
          h('main', { className: 'fs-workspace', 'data-view': tab }, h('header', { className: 'fs-head' }, h('div', { className: 'fs-title' }, icon(UI.IconShieldOutlineRegular, 20), h('h2', null, '运行时护栏')),
            h('div', { className: 'fs-tools fs-header-tools' }, h('span', { className: 'fs-switch' }, '启用监控', h(UI.Switch, { label: '启用监控', checked: Boolean(data?.monitoring), disabled: !online || state.busy, onChange: enabled => controller.action('setMonitoring', { enabled }) })),
              command('刷新状态', controller.refresh, UI.IconRefreshOutlineRegular, state.busy, true), command('离线自检', () => controller.action('selfTest'), UI.IconInfoOutlineRegular, !online || state.busy, true), command('导出诊断日志', () => controller.action('export'), UI.IconDownloadOutlineRegular, !online || state.busy, true),
              command(fullscreen ? '退出全屏' : '全屏查看', () => setFullscreen(value => !value), fullscreen ? UI.IconCloseOutlineRegular : UI.IconFullscreenOutlineRegular, false, true))),
          h('nav', { className: 'fs-tabs', role: 'tablist', 'aria-label': '护栏页面', 'aria-orientation': 'horizontal', onKeyDown: onTabKey }, ...tabs.map(([key, text, Icon]) => h('button', { key, id: `${id}-${key}`, type: 'button', role: 'tab', className: 'fs-tab', 'aria-selected': tab === key, 'aria-controls': `${id}-content`, tabIndex: tab === key ? 0 : -1, onClick: () => setTab(key) }, tab === key && h('span', { className: 'fs-tab-marker', 'aria-hidden': true }), icon(Icon, 16), h('span', null, text)))),
          state.error && h('p', { role: 'alert', className: 'fs-error' }, state.error), state.test && h('p', { role: 'status', className: 'fs-test' }, state.test),
          h('div', { key: tab, id: `${id}-content`, role: 'tabpanel', 'aria-labelledby': `${id}-${tab}`, className: 'fs-tabpanel', 'data-view': tab },
          tab === 'monitor' && (data ? h(React.Fragment, null,
            h('dl', { className: 'fs-stats' }, stat('已监控请求', data.monitoredRequests), stat('当前请求', data.activeRequests), stat('确认重复', data.confirmed), stat('已提交纠正', data.recoverySubmitted)),
            h('div', { className: 'fs-monitor-modes', role: 'group', 'aria-label': '监控列表切换' }, ...[['conversations', '对话列表'], ['events', '检测记录']].map(([key, text]) => h('button', { key, type: 'button', 'aria-pressed': pane === key, onClick: () => setPane(key) }, text))),
            h('div', { className: 'fs-monitor', 'data-pane': pane },
            h('section', { className: 'fs-section fs-monitor-section', 'aria-label': '逐对话实时监控' },
              h('div', { className: 'fs-section-head' }, h('h3', null, '对话'), h('span', { className: 'fs-muted', 'aria-live': 'polite' }, `${query.trim() ? `${visible.length} / ` : ''}${state.conversations.length} 个`)),
              h('div', { className: 'fs-search' }, h('span', { className: 'fs-search-icon' }, icon(UI.IconSearchOutlineRegular)), h('input', { type: 'search', value: query, placeholder: '搜索对话', 'aria-label': '搜索对话', onChange: event => setQuery(event.target.value) })),
              (state.error || state.conversationError) && h('p', { className: 'fs-error' }, '连接中断，以下为上次同步数据，不能判断当前模型状态。'),
              h('div', { className: 'fs-conversations fs-scroll', role: 'region', 'aria-label': '对话列表', tabIndex: 0 }, visible.length ? visible.map(item => {
                const current = state.error || state.conversationError ? { label: '状态已过期 · 等待重新连接', tone: 'off' } : health(item);
                const paused = item.sessionEnabled === false || item.coverage === 'disabled';
                return h('article', { className: 'fs-conversation', key: item.sessionKey },
                  h('div', { className: 'fs-conversation-head' }, h('div', { className: 'fs-conversation-title', title: conversationName(item) }, conversationName(item)),
                    h('div', { className: 'fs-tools' }, command(paused ? '启用此对话监控' : '暂停此对话监控', () => controller.action('setSessionEnabled', { sessionId: item.sessionId, enabled: paused }), paused ? UI.IconPlayOutlineRegular : UI.IconPauseOutlineRegular, state.busy, true), command('查看此对话记录', () => { setFilter(item.sessionKey); setPane('events'); }, UI.IconInfoOutlineRegular, false, true), command('打开对话', () => openConversation(item), UI.IconLinkOutlineRegular, !service('uiWorkspace')?.openSession, true))),
                  status(current.label, current.tone),
                  h('div', { className: 'fs-conversation-meta' }, h('span', null, `第 ${item.live?.turn ?? item.turn ?? 0} 轮 · 步骤 ${item.live?.step ?? item.step ?? 0}`), h('span', null, `确认重复 ${item.confirmed} 次`), h('span', null, `已提交纠正 ${item.recoverySubmitted} 次`)),
                  h('details', null, h('summary', null, '详情'), h('div', { className: 'fs-detail-body' }, h(Live, { data: item }), h('p', { className: 'fs-muted' }, `${item.counterScope === 'retained-events' ? '保留事件中' : '累计'}${item.cancelRequested ? `请求中断 ${item.cancelRequested} 次` : '未拦截、未中断'}`), !item.tracked && h('p', { className: 'fs-muted' }, '会话已不在实时跟踪中，仅显示保留事件。'))));
              }) : h('div', { className: 'fs-empty' }, query.trim() ? '没有匹配的对话' : '尚无已跟踪的对话')),
              h('p', { className: 'fs-health-note' }, '“暂未发现循环”仅描述已收到的输出。')),
            h('section', { className: 'fs-section fs-monitor-section', 'aria-label': '检测与处理' }, h('div', { className: 'fs-section-head' }, h('h3', null, '检测与处理'), h('span', { className: 'fs-muted' }, `${events.length} 条记录`)),
              filter && h('div', { className: 'fs-filter' }, h('span', { className: 'fs-muted' }, conversationName(state.conversations.find(item => item.sessionKey === filter) || { sessionKey: filter })), command('显示全部对话', () => setFilter(''), UI.IconCloseOutlineRegular, false, true)),
              h('div', { className: 'fs-scroll', role: 'region', 'aria-label': '检测记录', tabIndex: 0, ref: eventRegion }, events.length ? h(Events, { events, mode: data.mode, conversations: state.conversations }) : h('div', { className: 'fs-empty' }, '尚无检测记录'))))) : h('div', { className: 'fs-empty' }, state.error || '正在连接监控服务')),
          tab === 'safety' && h('div', { className: 'fs-settings' }, h(OperationSafety, { state })),
          tab === 'settings' && h('div', { className: 'fs-settings' }, data &&
            h('section', { className: 'fs-section' }, h('div', { className: 'fs-section-head' }, h('h3', null, '重复检测')),
              h('div', { className: 'fs-setting-row' }, h('div', { className: 'fs-setting-copy' }, h('strong', null, '处理模式'), h('small', null, '确认重复后执行的动作')),
              h('fieldset', { className: 'fs-model-modes', disabled: !online || state.busy, 'aria-label': '处理模式选择' },
                ...[['observe', '仅观察'], ['guard', '防护停止'], ['assist', '有限纠正']].map(([key, text]) => h('label', { key },
                  h('input', { type: 'radio', name: 'flash-mode', value: key, checked: data.mode === key, disabled: !online || state.busy || (key === 'guard' && data.compatibility?.guard === false), onChange: () => controller.action('setMode', { mode: key }) }), text)))),
              h('dl', { className: 'fs-facts' }, fact('检测后动作', data.mode === 'guard' ? '确认推理重复后请求停止本轮' : data.mode === 'assist' ? '回合结束后可提交纠正' : '显示告警，不中断输出'), fact('最近监控', time(data.lastMonitoredAt)), fact('磁盘日志', !data.logging.enabled ? '未开启' : data.logging.healthy ? '写入正常' : '写入失败'))), h(ModelScope, { state })),
          tab === 'updates' && h('div', { className: 'fs-settings' }, h(Updates, { state }))),
          h('footer', { className: 'fs-footer fs-muted' }, status(label, online && data.monitoring ? 'on' : 'off'), h('time', { dateTime: state.updatedAt || undefined }, `最近同步 ${time(state.updatedAt)}`)))));
        return h(React.Fragment, null, h('div', { className: 'fs-mount', 'data-embedded': String(embedded), ref: mount }), createPortal(content, surface));
      }
      function OperationSafety({ state }) {
        const value = state.data?.operationSafety;
        const labels = { disabled: '未开启', active: '已启用 · 执行前检查', blocked: '防护不可用 · 已阻止受保护工具', disposed: '已停止' };
        const rules = {
          elevation: '系统提权', 'outside-workspace': '工作区外操作', 'read-only-write': '只读模式修改', 'read-only-unknown': '无法确认仅进行读取',
          destructive: '破坏性操作', 'opaque-execution': '未知执行或交互终端输入', 'invalid-arguments': '参数无法识别',
          'policy-unavailable': '无法读取宿主权限', 'host-unverified': '此宿主版本尚未验证', 'guard-unavailable': '缺少硬拦截接口',
          'settings-invalid': '设置无法读取，请重新保存开关', 'check-failed': '检查异常', 'approval-unavailable': '缺少有效单次审批',
          'configuration-changed': '审批期间配置发生变化', cancelled: '操作取消',
        };
        const actions = { denied: '已阻止', 'approval-requested': '已申请审批', approved: '已获单次批准', rejected: '未获批准', cancelled: '已取消' };
        return h('section', { className: 'fs-section', 'aria-label': '操作防护' },
          h('div', { className: 'fs-section-head' }, h('h3', null, '工具执行检查'), status(state.error ? '状态未同步' : labels[value?.state] || '等待同步', value?.state === 'active' && !state.error ? 'on' : 'off')),
          h('div', { className: 'fs-setting-row' }, h('div', { className: 'fs-setting-copy' }, h('strong', null, '启用操作防护'), h('small', null, '跟随当前对话的权限模式')), h(UI.Switch, {
            label: '启用操作防护', checked: Boolean(value?.enabled), disabled: !value || Boolean(state.error) || state.busy,
            onChange: enabled => controller.action('setOperationSafety', { enabled }),
          })),
          h('p', { className: 'fs-note' }, '按每个对话在输入框选择的权限模式检查，独立覆盖所有模型。暂停防空转监控或更改模型范围不影响操作防护。'),
          h('dl', { className: 'fs-facts fs-rules', 'aria-label': '三种权限模式的放行与拦截规则' },
            fact('仅查看', '放行读取；拒绝明确的写入、编辑、删除；无法确认用途的执行请求单次审批。'),
            fact('仅工作区修改', '放行工作区内普通编辑、Python / Node 脚本及构建测试；越界写入、删除和未知执行请求单次审批；拒绝系统提权。'),
            fact('完全权限', '插件不额外拦截或审批工具调用，交由 DSH 原生工具与系统权限处理。')),
          h('p', { className: 'fs-note' }, '受限模式下，交互终端当前目录和输入缓冲无法可靠确认，发送输入（包括空回车）需单次审批；中断控制键放行。普通脚本优先使用 pwsh / bash。'),
          state.safetyError && h('p', { className: 'fs-error', role: 'alert' }, state.safetyError),
          value?.enabled && value.state === 'blocked' && h('p', { className: 'fs-error', role: 'alert' }, rules[value.reason] || '防护暂不可用，受保护工具已阻止；可关闭操作防护恢复宿主原有行为。'),
          value && h(React.Fragment, null,
            h('div', { className: 'fs-records' }, h('h3', null, '检查记录'), h('dl', { className: 'fs-stats' }, stat('已检查', value.checked), stat('已阻止 / 未获批准', value.denied), stat('审批请求', value.approvalRequests), stat('单次批准', value.approved)),
            value.events.length ? h('ol', { className: 'fs-events fs-section-scroll', 'aria-label': '操作防护记录', tabIndex: 0 }, ...value.events.slice(0, 20).map((event, index) => h('li', { key: `${event.time}-${index}`, className: 'fs-event' },
              h('strong', null, `${actions[event.action] || event.action} · ${event.tool}`),
              h('p', null, rules[event.rule] || event.rule), h('small', { className: 'fs-muted' }, `${time(event.time)} · ${event.session} · ${event.mode}`)))) : h('p', { className: 'fs-empty' }, '尚无操作防护记录。')),
            h('p', { className: 'fs-note' }, '完整命令和参数在 DSH 原生审批中展示。此处及诊断导出仅保留原因与结果，不保存命令正文。'),
            h('details', null, h('summary', null, '环境与覆盖工具'), h('div', { className: 'fs-detail-body' }, h('dl', { className: 'fs-facts' }, fact('宿主版本', value.hostVersion), fact('设置保存', value.persistent ? '重启后保留' : '仅本次运行')), h('p', { className: 'fs-note' }, `覆盖工具：${value.coveredTools.join('、')}。权限服务或执行前接口异常时会显示原因并阻止受保护调用。操作防护不能代替系统沙盒。`)))));
      }
      function ModelScope({ state }) {
        const value = state.modelScope;
        const [draft, setDraft] = React.useState(null), [query, setQuery] = React.useState('');
        React.useEffect(() => { if (value) controller.refreshModels(); }, [Boolean(value)]);
        const scope = draft?.scope ?? value?.scope ?? 'all', selections = draft?.selections ?? value?.selections ?? [];
        const id = item => JSON.stringify([item.provider ?? null, item.model]);
        const chosen = new Set(selections.map(id));
        const options = new Map((value?.availableModels ?? []).map(item => [id(item), item]));
        for (const item of selections) if (!options.has(id(item))) options.set(id(item), { ...item, label: item.model, providerLabel: item.provider ?? '任意渠道（配置项）' });
        const filtered = [...options.values()].filter(item => `${item.label} ${item.model} ${item.providerLabel} ${item.provider ?? ''}`.toLowerCase().includes(query.toLowerCase()));
        const disabled = !value || state.busy;
        const select = (item, checked) => setDraft({ scope, selections: checked ? [...selections, { model: item.model, ...(item.provider === undefined ? {} : { provider: item.provider }) }]
          : selections.filter(selected => id(selected) !== id(item)) });
        const save = async () => {
          await controller.action('setModelScope', { scope, selections });
          if (!controller.snapshot().scopeError) setDraft(null);
        };
        return h('section', { className: 'fs-section', 'aria-label': '模型监控范围' },
          h('div', { className: 'fs-section-head' }, h('h3', null, '监控范围'), command('刷新模型列表', controller.refreshModels, UI.IconRefreshOutlineRegular, disabled || state.scopeLoading)),
          h('p', { className: 'fs-note' }, value ? `当前生效：${value.scope === 'all' ? '全部模型（所有渠道）' : `仅选中的 ${value.selections.length} 个模型`}` : '正在读取监控范围'),
          h('fieldset', { className: 'fs-model-modes', disabled, 'aria-label': '监控模式' },
            ...[['all', '全部模型'], ['selected', '仅选中的模型']].map(([key, label]) => h('label', { key },
              h('input', { type: 'radio', name: 'flash-model-scope', value: key, checked: scope === key, onChange: () => setDraft({ scope: key, selections }) }), label))),
          scope === 'selected' && h(React.Fragment, null,
            h('input', { className: 'fs-model-search', type: 'search', value: query, placeholder: '搜索模型或渠道', 'aria-label': '搜索模型或渠道', onChange: event => setQuery(event.target.value) }),
            h('div', { className: 'fs-model-list' }, filtered.length ? filtered.map(item => h('label', { className: 'fs-model-option', key: id(item) },
              h('input', { type: 'checkbox', checked: chosen.has(id(item)), disabled, onChange: event => select(item, event.target.checked), 'aria-label': `${item.providerLabel} / ${item.model}` }),
              h('span', null, item.label, h('small', null, `${item.providerLabel} · ${item.model}`))))
              : h('p', { className: 'fs-muted' }, '暂无匹配模型。可刷新列表，或在宿主中使用一次该模型后再选择。')),
            !selections.length && h('p', { className: 'fs-note' }, '尚未选择模型；保存后将不监控任何模型。')),
          value?.catalogError && h('p', { className: 'fs-note' }, '部分渠道暂未返回模型列表，仍可选择已保存或已使用的模型。'),
          value?.loadError && h('p', { className: 'fs-error' }, '上次保存的范围无法读取，当前使用配置中的范围，请重新保存。'),
          state.scopeError && h('p', { className: 'fs-error', role: 'alert' }, state.scopeError),
          state.scopeReadError && h('p', { className: 'fs-error', role: 'alert' }, state.scopeReadError),
          command('保存监控范围', save, UI.IconCheckOutlineRegular, disabled || !draft),
          h('p', { className: 'fs-note' }, `${value?.persistent ? '选择保存在当前配置环境，重启后保留。' : '此宿主未提供设置存储，选择仅在本次运行生效。'}取消选择立即停止跟踪并撤销待执行纠正；新加入的模型从下一次请求开始监控。`));
      }
      function Updates({ state }) {
        const value = state.updates;
        const phases = { unavailable: '此宿主不支持在线更新', idle: '尚未检查', checking: '正在检查', current: '已是最新正式版', available: '有新版本', 'waiting-idle': '等待所有对话空闲后安装', downloading: '正在下载并校验', installing: '正在交给 DSH 安装', 'restart-required': '已安装，需重启 DSH 生效', error: '更新未完成' };
        const errors = { 'github-auth-or-release': '公开 Release 暂不可访问或尚未发布，请稍后重试。', 'github-denied': 'GitHub 暂时限制了访问，且公开更新清单暂不可用，请稍后重试。', 'invalid-release': 'Release 更新信息格式不正确，未安装。', 'missing-artifact': 'Release 缺少安装包或校验值。', 'checksum-failed': '安装包 SHA-256 校验失败，未安装。', 'incompatible-host': '新版本不支持当前 DSH 或 Node.js，未安装。', 'host-install-failed': 'DSH 未确认安装成功，请检查原生插件页。', 'storage-failed': '无法保存更新设置，自动更新未开启。', 'install-scripts': '安装包声明安装脚本，已拒绝自动安装。' };
        const busy = state.updateBusy || ['checking', 'downloading', 'installing', 'restart-required'].includes(value?.phase);
        return h('section', { className: 'fs-section', 'aria-label': '插件更新' },
          h('div', { className: 'fs-about' }, icon(UI.IconShieldOutlineRegular, 40), h('div', null, h('strong', null, 'DSH 运行时护栏'), h('small', null, `版本 ${value?.currentVersion || '读取中'}`))),
          h('div', { className: 'fs-section-head' }, h('h3', null, '版本与更新'),
            h('a', { className: 'fs-link', href: 'https://github.com/MyRemme/dsh-runtime-guard', target: '_blank', rel: 'noopener noreferrer', title: '打开 GitHub 仓库' }, icon(UI.IconLinkOutlineRegular), ' GitHub 仓库')),
          h('dl', { className: 'fs-facts' }, fact('当前版本', value?.currentVersion || '读取中'), fact('最新正式版', value?.latestVersion || '尚未检查'), fact('更新状态', state.updateError || phases[value?.phase] || '连接中'), fact('最近检查', time(value?.checkedAt))),
          h('div', { className: 'fs-setting-row' }, h('div', { className: 'fs-setting-copy' }, h('strong', null, '自动更新'), h('small', null, '在对话空闲时安装已校验的正式版')), h(UI.Switch, { label: '自动更新', checked: Boolean(value?.automatic), disabled: !value?.available || state.updateBusy, onChange: enabled => controller.updateAction('setAutomaticUpdates', { enabled }) })),
          h('div', { className: 'fs-setting-actions' },
            command('检查更新', () => controller.updateAction('checkUpdates'), UI.IconRefreshOutlineRegular, !value?.available || busy),
            command('安装更新', () => controller.updateAction('installUpdate'), UI.IconDownloadOutlineRegular, !value?.available || busy || !['available', 'waiting-idle'].includes(value?.phase))),
          h('p', { className: 'fs-note' }, '关闭自动更新会撤销等待中或下载中的自动安装；手动安装及已交给 DSH 的安装继续完成。排队中的手动安装固定所选版本，自动检查不会替换该任务。'),
          value?.error && h('p', { className: 'fs-error', role: 'status' }, errors[value.error] || '下载、校验或安装未完成；当前版本继续保留，可检查更新后重试。'));
      }
      function SessionStatus({ sessionId }) {
        const state = useState(), data = state.sessions[sessionId], error = state.sessionErrors[sessionId];
        const [open, setOpen] = React.useState(false), [position, setPosition] = React.useState({});
        const anchor = React.useRef(null), dialog = React.useRef(null), dialogId = React.useId();
        React.useEffect(() => controller.watch(sessionId), [sessionId]);
        React.useEffect(() => { setOpen(false); }, [sessionId]);
        React.useLayoutEffect(() => {
          if (!open) return;
          const place = () => {
            const rect = anchor.current.getBoundingClientRect(), width = Math.min(420, window.innerWidth - 24);
            const above = rect.top - 20, below = window.innerHeight - rect.bottom - 20;
            setPosition({ width, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
              ...(above >= below ? { bottom: window.innerHeight - rect.top + 8, maxHeight: Math.max(0, above) }
                : { top: rect.bottom + 8, maxHeight: Math.max(0, below) }) });
          };
          const close = event => { if (event.type === 'keydown' && event.key !== 'Escape') return; if (event.type === 'pointerdown' && (dialog.current?.contains(event.target) || anchor.current?.contains(event.target))) return; setOpen(false); if (event.type === 'keydown') anchor.current?.focus(); };
          place(); document.addEventListener('keydown', close); document.addEventListener('pointerdown', close); window.addEventListener('resize', place);
          return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', close); window.removeEventListener('resize', place); };
        }, [open]);
        let label = '连接中', tone = 'off';
        if (error) label = '监控未连接';
        else if (data) ({ label, tone } = health(data));
        return h('div', { className: 'fs-dock', 'data-composer-stat': 'runtime-guard' },
          h('button', { type: 'button', className: 'fs-dock-button', ref: anchor, 'data-tone': tone, title: '运行时护栏：' + label, 'aria-label': '运行时护栏：' + label, 'aria-expanded': open, 'aria-controls': open ? dialogId : undefined, 'aria-haspopup': 'dialog', onClick: () => setOpen(value => !value) }, icon(tone === 'warn' ? UI.IconWarningOutlineRegular : UI.IconShieldOutlineRegular, 12), h('span', { role: 'status' }, '护栏 · ' + label)),
          open && createPortal(h('section', { id: dialogId, role: 'dialog', 'aria-label': '此对话的防空转记录', className: 'fs-dialog', ref: dialog, style: position },
            h('div', { className: 'fs-head' }, h('h3', null, '此对话 · 运行时护栏'), h('div', { className: 'fs-tools' }, data && command(data.sessionEnabled === false || data.coverage === 'disabled' ? '启用此对话监控' : '暂停此对话监控', () => controller.action('setSessionEnabled', { sessionId, enabled: data.sessionEnabled === false || data.coverage === 'disabled' }), null, state.busy), command('关闭', () => { setOpen(false); anchor.current?.focus(); }, UI.IconCloseOutlineRegular, false, true))),
            error ? h('p', { className: 'fs-error' }, error) : data && h(React.Fragment, null,
              h('p', { className: 'fs-muted' }, label), h('dl', { className: 'fs-stats' }, stat('已监控', data.monitoredRequests), stat('确认重复', data.confirmed), stat('请求中断', data.cancelRequested), stat('已提交纠正', data.recoverySubmitted)),
              h(Live, { data }),
              h('dl', { className: 'fs-facts' }, fact('模式', modeName(data.mode)), fact('拦截动作', data.latestEvent?.action === 'stop-confirmed' ? `宿主已确认停止（累计请求中断 ${data.cancelRequested} 次）` : data.cancelRequested ? `已请求中断 ${data.cancelRequested} 次，需以宿主结果为准` : '无，未中断模型或工具'), fact('最近监控', time(data.lastMonitoredAt))),
              data.events.length ? h(Events, { events: data.events, mode: data.mode }) : h('p', { className: 'fs-muted' }, data.coverage === 'checked' ? '最近已检查的输出中未发现符合规则的重复。' : '尚无检测事件。'),
              h('p', { className: 'fs-note' }, '每 2 秒同步。暂未发现循环只描述已收到的输出，不能保证后续不会重复。计数在重新跟踪或插件重载后重置；详情取自全局最近 100 条事件。'))), document.body));
      }
      function Icon() {
        const { data, error } = useState();
        return h('span', { className: 'fs-icon', title: error || `运行时护栏 · ${data?.monitoring ? '在线' : '暂停'}` }, icon(UI.IconShieldOutlineRegular, 20), h('i', { className: 'fs-dot', style: { background: error || data?.confirmed ? 'var(--dsw-alias-state-warn-primary)' : undefined } }));
      }
      function Toast() {
        const { toast, data } = useState(); if (!toast) return null;
        const text = explain(toast, data?.mode);
        return h('aside', { className: 'fs-toast', role: 'alert' }, h('strong', null, '护栏 · ' + text.title), h('p', null, text.result), h('div', { className: 'fs-row' }, command('查看记录', () => { ctx.layout.selectPanel(PANEL); controller.dismiss(); }, UI.IconInfoOutlineRegular), command('关闭', controller.dismiss, UI.IconCloseOutlineRegular, false, true)));
      }
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, Panel));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 20, label: () => '运行时护栏' }, Icon));
      const EmbeddedPanel = props => h(Panel, { ...props, embedded: true });
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-runtime-guard' }, EmbeddedPanel));
      ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: 'dsh-runtime-guard#runtime-guard' }, EmbeddedPanel));
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'runtime-guard', order: 2, inject: sessionId => ({ sessionId }) }, SessionStatus));
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'runtime-guard.alert' }, Toast));
    }
    return { inject: ['slots', 'connection', 'layout'], apply };
  },
});
