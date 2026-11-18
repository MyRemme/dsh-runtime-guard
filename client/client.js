// Native Harness module. Display state never enters the model's conversation.
window.__ModuleLoader__.load({
  id: 'dsh-runtime-guard',
  factory: require => {
    const React = require('react'), { createPortal } = require('react-dom');
    const UI = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement, PANEL = 'runtime-guard';
    const css = `
      .rg26-root,.rg26-dialog,.rg26-toast{font:14px/22px "Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI","Microsoft YaHei",sans-serif;letter-spacing:0;color:var(--dsw-alias-label-primary,#202020);box-sizing:border-box;overflow-wrap:anywhere;text-align:left}
      .rg26-root *,.rg26-dialog *,.rg26-toast *{box-sizing:border-box;letter-spacing:0}
      .rg26-root button,.rg26-dialog button,.rg26-toast button{font-family:inherit}
      .rg26-root p{margin:0}
      .rg26-root svg,.rg26-dialog svg{flex:none;vertical-align:middle}
      .rg26-root,.rg26-dialog{--rg26-accent:var(--dsw-alias-state-business-primary,#7aa2ff);--rg26-line:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 10%,transparent);--rg26-fill:var(--dsw-alias-interactive-bg-hover,#f5f5f5);--rg26-soft:color-mix(in srgb,var(--dsw-alias-label-primary,#fff) 4%,var(--dsw-alias-bg-base,#151515));--rg26-secondary:var(--dsw-alias-label-secondary,#aaa)}
      .rg26-root{height:100%;min-height:0;overflow:hidden;container:rg26-panel / inline-size;background:var(--dsw-alias-bg-base,#fff)}
      .rg26-root[data-embedded=true]{height:min(720px,calc(100dvh - 96px));flex:none}
      .rg26-page{width:100%;height:100%;min-height:0;display:flex;flex-direction:column}
      .rg26-workspace{display:flex;flex:1;flex-direction:column;min-height:0;min-width:0;width:100%;max-width:1560px;margin:auto;padding:26px 30px 14px;gap:22px}
      .rg26-workspace>.rg26-head,.rg26-footer{width:100%;margin:0}
      .rg26-head,.rg26-row,.rg26-tools,.rg26-state,.rg26-event-head{display:flex;align-items:center;gap:8px;min-width:0}
      .rg26-head{justify-content:space-between;gap:16px;flex-wrap:wrap}
      .rg26-workspace>.rg26-head{flex-wrap:nowrap;flex:none}
      .rg26-head .rg26-title{min-width:0;flex:1;display:flex;align-items:center;gap:12px}
      .rg26-head .rg26-title>svg{color:var(--rg26-accent);width:25px;height:25px}
      .rg26-head h2{font-size:20px;line-height:28px;font-weight:600;margin:0}
      .rg26-sub,.rg26-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
      .rg26-sub{margin:4px 0 0}
      .rg26-tools{gap:4px;flex-wrap:wrap}
      .rg26-header-tools{flex-wrap:nowrap;gap:2px}
      .rg26-switch{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary);margin-right:12px}
      .rg26-header-tools .rg26-switch{white-space:nowrap}
      .rg26-state{font-size:12px;color:var(--dsw-alias-label-secondary)}
      .rg26-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary);flex:none}
      .rg26-state[data-tone=warn],.rg26-warn{color:var(--dsw-alias-state-warn-primary)}
      .rg26-state[data-tone=warn] .rg26-dot{background:currentColor}
      .rg26-state[data-tone=off]{color:var(--dsw-alias-label-tertiary)}
      .rg26-state[data-tone=off] .rg26-dot{background:currentColor}
      .rg26-icon-button{width:28px!important;height:28px!important;padding:0!important;flex:none}
      .rg26-root .rg26-icon-button{width:30px!important;height:30px!important;border-radius:4px}
      .rg26-action{height:28px;font-size:12px!important}
      .rg26-root .rg26-action{height:32px;font-size:13px!important;padding:4px 12px;border:1px solid var(--rg26-line);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:4px}
      .rg26-root button{transition:background 140ms,color 140ms,opacity 140ms,transform 100ms}
      .rg26-root button:active:not(:disabled){transform:scale(.97)}
      .rg26-tabs{display:flex;gap:6px;flex:none;padding:0 0 14px;border-bottom:1px solid var(--rg26-line);overflow-x:auto;scrollbar-width:none}
      .rg26-tab{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;min-height:36px;padding:7px 14px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;white-space:nowrap;cursor:pointer;transition:color 140ms,background 140ms}
      .rg26-tab:hover{color:var(--dsw-alias-label-primary);background:var(--rg26-soft)}
      .rg26-tab[aria-selected=true]{color:var(--rg26-accent);background:color-mix(in srgb,var(--rg26-accent) 12%,transparent);font-weight:600}
      .rg26-tabpanel{flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;animation:rg26-page-in 220ms cubic-bezier(.16,1,.3,1)}
      .rg26-tabpanel[data-view=monitor]{overflow:hidden;display:flex;flex-direction:column;gap:22px;width:100%;scrollbar-gutter:auto}
      .rg26-overview{display:flex;align-items:center;gap:30px;padding:20px 0 24px;border-bottom:1px solid var(--rg26-line);flex:none}
      .rg26-overview-copy{display:flex;gap:14px;align-items:center;flex:1;min-width:0}
      .rg26-emblem{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:8px;background:color-mix(in srgb,var(--rg26-accent) 11%,transparent);color:var(--rg26-accent);flex:none}
      .rg26-overview h3{font-size:21px;line-height:30px;margin:0 0 5px;font-weight:600}
      .rg26-overview p{font-size:12px;line-height:20px;color:var(--rg26-secondary)}
      .rg26-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0}
      .rg26-root .rg26-stats{gap:10px;padding:0;flex:none}
      .rg26-stat{padding:8px 16px 12px;border-left:.5px solid var(--dsw-alias-border-l2)}
      .rg26-stat:first-child{border-left:0;padding-left:0}
      .rg26-root .rg26-stat,.rg26-root .rg26-stat:first-child{padding:12px 16px;border:1px solid var(--rg26-line);border-radius:6px;background:color-mix(in srgb,var(--rg26-fill) 70%,var(--dsw-alias-bg-base,#fff))}
      .rg26-stat dt{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px}
      .rg26-stat dd{font-size:24px;line-height:32px;font-weight:600;font-variant-numeric:tabular-nums;margin:4px 0 0}
      .rg26-root .rg26-overview .rg26-stats{display:grid;grid-template-columns:repeat(3,minmax(90px,1fr));gap:28px;flex:1;max-width:500px}
      .rg26-root .rg26-overview .rg26-stat,.rg26-root .rg26-overview .rg26-stat:first-child{background:none;border:0;padding:0}
      .rg26-root .rg26-overview .rg26-stat dd{font-size:26px;line-height:34px}
      .rg26-overview .rg26-stat:nth-child(2) dd{color:var(--dsw-alias-state-warn-primary,#e5b66e)}
      .rg26-monitor-modes{display:none}
      .rg26-monitor{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:30px;flex:1;min-height:0}
      .rg26-monitor-section{display:flex;flex-direction:column;min-height:0;min-width:0}
      .rg26-monitor-section+.rg26-monitor-section{border-left:1px solid var(--rg26-line);padding-left:30px}
      .rg26-section h3{font-size:15px;line-height:22px;font-weight:600;margin:0}
      .rg26-section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
      .rg26-monitor-section>.rg26-section-head{flex:none;margin-bottom:12px;min-height:24px}
      .rg26-section-head .rg26-muted{font-size:11px}
      .rg26-monitor-section .rg26-health-note{flex:none;font-size:12px;line-height:18px;margin:10px 0 0}
      .rg26-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
      .rg26-root :is(.rg26-scroll,.rg26-tabpanel,.rg26-section-scroll,.rg26-model-list){scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l3,#ccc) transparent}
      .rg26-search{position:relative;margin-bottom:12px;flex:none}
      .rg26-search input{width:100%;height:38px;padding:5px 10px 5px 32px;border:1px solid var(--rg26-line);border-radius:6px;background:var(--rg26-soft);color:inherit;font:inherit;font-size:13px}
      .rg26-search input:focus-visible{outline:0;border-bottom:2px solid var(--rg26-accent)}
      .rg26-search-icon{position:absolute;left:10px;top:12px;display:flex;color:var(--dsw-alias-label-tertiary)}
      .rg26-filter{margin-bottom:8px;display:flex;align-items:center;gap:8px;min-width:0}
      .rg26-filter>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
      .rg26-conversations{display:flex;flex-direction:column;gap:10px;padding:0 4px 4px 0}
      .rg26-conversation{border:1px solid var(--rg26-line);border-radius:8px;padding:16px;background:var(--rg26-soft);min-width:0;flex:none;transition:background 140ms,border-color 140ms}
      .rg26-conversation:hover{border-color:color-mix(in srgb,var(--rg26-accent) 35%,var(--rg26-line));background:color-mix(in srgb,var(--rg26-accent) 4%,var(--rg26-soft))}
      .rg26-conversation[data-selected=true]{border-color:color-mix(in srgb,var(--rg26-accent) 65%,var(--rg26-line));background:color-mix(in srgb,var(--rg26-accent) 7%,var(--rg26-soft))}
      .rg26-conversation-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}
      .rg26-conversation-title{font-weight:600;font-size:14px;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rg26-conversation .rg26-tools{flex:none;flex-wrap:nowrap;gap:0;opacity:.45;transition:opacity 140ms}
      .rg26-conversation:hover .rg26-tools,.rg26-conversation:focus-within .rg26-tools{opacity:1}
      .rg26-conversation .rg26-icon-button{width:26px!important;height:26px!important}
      .rg26-conversation-meta{display:flex;flex-wrap:wrap;gap:4px 16px;margin-top:10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums}
      .rg26-conversation summary{margin-top:8px}
      .rg26-root details{margin-top:6px}
      .rg26-root summary{width:fit-content;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;transition:color 140ms}
      .rg26-root summary:hover{color:var(--rg26-accent)}
      .rg26-root details[open]>.rg26-detail-body{animation:rg26-detail-in 160ms ease-out}
      .rg26-live{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
      .rg26-events{list-style:none;padding:0;margin:0}
      .rg26-event{padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .rg26-root .rg26-event{padding:16px 8px 18px 20px;position:relative;border-bottom:1px solid var(--rg26-line)}
      .rg26-root .rg26-event:before{content:'';position:absolute;left:2px;top:24px;width:5px;height:5px;background:var(--rg26-accent);border-radius:50%}
      .rg26-event-head{justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0 12px}
      .rg26-event-title{font-weight:600;font-size:13px;line-height:22px}
      .rg26-event time{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:20px;flex:none}
      .rg26-event p{margin:7px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}
      .rg26-event .rg26-result{color:var(--dsw-alias-label-primary)}
      .rg26-root .rg26-event .rg26-result{color:var(--dsw-alias-label-secondary)}
      .rg26-event-context{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px;min-width:0}
      .rg26-event-context .rg26-link{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
      .rg26-link{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;padding:0;text-align:left;cursor:pointer}
      .rg26-link:disabled{color:var(--dsw-alias-label-secondary);cursor:default}
      .rg26-tag{font-size:12px;line-height:18px;padding:1px 6px;border-radius:var(--dsw-radius-sm,4px);color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);white-space:nowrap}
      .rg26-empty{padding:28px 0;color:var(--dsw-alias-label-tertiary);text-align:center;border-top:.5px solid var(--dsw-alias-border-l2)}
      .rg26-monitor .rg26-scroll>.rg26-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:240px;border:0;font-size:13px}
      .rg26-empty-icon{color:var(--rg26-accent);opacity:.65;margin-bottom:6px}
      .rg26-empty small{max-width:260px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
      .rg26-error{color:var(--dsw-alias-state-error-primary);margin:0}
      .rg26-test,.rg26-success{color:var(--dsw-alias-state-success-primary);margin:0}
      .rg26-root .rg26-error,.rg26-root .rg26-test{font-size:13px;line-height:20px}
      .rg26-note{margin:10px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px}
      .rg26-root .rg26-note{font-size:12px;line-height:21px;margin-top:14px}
      .rg26-health-note{margin:8px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .rg26-settings{display:flex;flex-direction:column;gap:28px;width:100%;max-width:1100px;margin:0 auto;padding:8px 4px 28px}
      .rg26-tabpanel[data-view=settings] .rg26-settings{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:28px 40px;align-items:start}
      .rg26-settings>.rg26-section{min-width:0}
      .rg26-settings>.rg26-section>.rg26-section-head{padding-bottom:16px;border-bottom:1px solid var(--rg26-line);margin-bottom:0}
      .rg26-tabpanel[data-view=settings] .rg26-settings>.rg26-section:nth-child(2){grid-column:1;grid-row:1}
      .rg26-tabpanel[data-view=settings] .rg26-settings>.rg26-section:nth-child(3){grid-column:1;grid-row:2}
      .rg26-tabpanel[data-view=settings] .rg26-settings>.rg26-section:first-child{grid-column:2;grid-row:1 / span 2;border-left:1px solid var(--rg26-line);padding-left:32px}
      .rg26-facts{margin:0}
      .rg26-fact{display:flex;justify-content:space-between;align-items:baseline;gap:20px;padding:10px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
      .rg26-root .rg26-fact{display:grid;grid-template-columns:100px minmax(0,1fr);align-items:center;gap:16px;min-height:48px;padding:12px 0;border-bottom:1px solid var(--rg26-line);font-size:13px;line-height:22px}
      .rg26-fact dt{color:var(--dsw-alias-label-secondary);flex:none;font-weight:400}
      .rg26-fact dd{margin:0;text-align:right;min-width:0}
      .rg26-root .rg26-fact dd{text-align:left}
      .rg26-root .rg26-fact:last-child{border-bottom:0}
      .rg26-root .rg26-rules .rg26-fact{grid-template-columns:110px minmax(0,1fr);align-items:start;padding:16px 4px}
      .rg26-root .rg26-rules dd{text-align:left;font-size:13px;color:var(--dsw-alias-label-secondary)}
      .rg26-setting-row{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:74px;padding:16px 0;border-bottom:1px solid var(--rg26-line)}
      .rg26-setting-copy{min-width:0}
      .rg26-setting-copy strong{display:block;font-size:14px;font-weight:600}
      .rg26-setting-copy small{display:block;max-width:340px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary);margin-top:4px}
      .rg26-settings .rg26-section-head+.rg26-note{margin-top:0}
      .rg26-settings .rg26-section>.rg26-facts{margin-top:4px}
      .rg26-settings .rg26-setting-row+.rg26-facts{border-top:0;margin-top:0}
      .rg26-settings .rg26-facts+.rg26-note{margin-top:12px}
      .rg26-model-modes{display:flex;flex-wrap:wrap;min-width:0;border:0;gap:4px;padding:4px;margin:16px 0 12px;background:var(--rg26-fill);border-radius:6px;width:fit-content;max-width:100%}
      .rg26-setting-row .rg26-model-modes{margin:0;flex:none}
      .rg26-model-modes label{position:relative;display:flex;align-items:center;gap:8px;padding:6px 14px;min-height:34px;border-radius:4px;cursor:pointer;font-size:13px;transition:background 140ms,box-shadow 140ms}
      .rg26-model-modes label:has(:checked){background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 1px 3px #0001;color:var(--rg26-accent)}
      .rg26-model-modes label:has(:disabled){opacity:.5;cursor:default}
      .rg26-model-modes input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:inherit;flex-shrink:0}
      .rg26-model-modes label:has(:focus-visible){outline:2px solid var(--rg26-accent);outline-offset:2px}
      .rg26-settings .rg26-mode-row{display:block;border-bottom:0;padding-bottom:6px}
      .rg26-settings .rg26-mode-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;max-width:100%;padding:0;background:none;gap:8px;margin-top:14px}
      .rg26-settings .rg26-mode-options label{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:6px;border:1px solid var(--rg26-line);background:var(--rg26-soft);border-radius:6px;padding:12px 10px;min-height:84px}
      .rg26-settings .rg26-mode-options label:has(:checked){background:color-mix(in srgb,var(--rg26-accent) 10%,transparent);border-color:color-mix(in srgb,var(--rg26-accent) 65%,transparent);box-shadow:none}
      .rg26-mode-options strong{font-size:13px;font-weight:600}
      .rg26-mode-options small{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
      .rg26-policy{margin:16px 0 24px}
      .rg26-policy>summary{font-size:13px;color:var(--rg26-secondary);padding:10px 0}
      .rg26-model-list{max-height:260px;overflow:auto;border-top:.5px solid var(--dsw-alias-border-l2);margin:12px 0}
      .rg26-model-option{display:flex;align-items:center;gap:8px;padding:12px 8px;border-bottom:1px solid var(--rg26-line);cursor:pointer;transition:background 140ms}
      .rg26-model-option:hover{background:var(--rg26-fill)}
      .rg26-model-option span{min-width:0;overflow-wrap:anywhere}
      .rg26-model-option small{display:block;color:var(--dsw-alias-label-tertiary)}
      .rg26-model-option input{flex-shrink:0;width:17px;height:17px;margin-right:6px;accent-color:var(--dsw-alias-state-business-primary)}
      .rg26-model-search{box-sizing:border-box;width:100%;height:36px;padding:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:13px}
      .rg26-setting-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px}
      .rg26-records{margin-top:20px}
      .rg26-records h3{margin-bottom:12px}
      .rg26-root .rg26-records .rg26-stats{gap:0;border-bottom:1px solid var(--rg26-line);padding:10px 0 20px;margin-bottom:12px}
      .rg26-root .rg26-records .rg26-stat,.rg26-root .rg26-records .rg26-stat:first-child{background:none;border:0;border-radius:0;padding:0 16px}
      .rg26-root .rg26-records .rg26-stat:first-child{padding-left:0}
      .rg26-root .rg26-records .rg26-stat dd{font-size:24px}
      .rg26-section-scroll{max-height:380px;overflow:auto;overscroll-behavior:contain}
      .rg26-tabpanel[data-view=updates] .rg26-settings{max-width:740px;padding-top:12px}
      .rg26-about{display:flex;align-items:center;gap:16px;padding:8px 0 28px;color:var(--rg26-accent)}
      .rg26-about>svg{padding:8px;box-sizing:content-box;background:color-mix(in srgb,var(--rg26-accent) 10%,transparent);border-radius:8px}
      .rg26-about strong{display:block;font-size:22px;line-height:28px;color:var(--dsw-alias-label-primary);font-weight:600}
      .rg26-about small{display:block;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:4px}
      .rg26-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;font-size:11px;line-height:18px;padding-top:2px}
      .rg26-footer time{font-size:11px}
      .rg26-summary{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .rg26-dock{position:relative;min-width:0;max-width:100%;display:inline-flex}
      .rg26-dock-button{font:11px/18px var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-tertiary);border:0;background:transparent;padding:2px 4px;border-radius:var(--dsw-radius-sm,4px);display:inline-flex;align-items:center;gap:5px;cursor:pointer;min-width:0;max-width:100%;white-space:nowrap}
      .rg26-dock-button span{overflow:hidden;text-overflow:ellipsis}
      .rg26-dock-button:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}
      .rg26-dock-button[data-tone=warn]{color:var(--dsw-alias-state-warn-primary)}
      .rg26-icon{display:inline-flex;flex:none;position:relative}
      .rg26-icon .rg26-dot{position:absolute;right:0;top:0;border:1px solid var(--dsw-alias-bg-base)}
      .rg26-dialog{position:fixed;z-index:1100;border:0;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);display:flex;flex-direction:column;overflow:hidden}
      .rg26-dialog-scroll{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:20px}
      .rg26-dialog .rg26-head{flex-wrap:nowrap;gap:10px;margin-bottom:18px}
      .rg26-dialog h3{margin:0;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;flex:1}
      .rg26-dialog h3 svg{color:var(--rg26-accent)}
      .rg26-dialog .rg26-tools{flex:none;gap:2px}
      .rg26-dialog .rg26-icon-button{border-radius:4px}
      .rg26-card-status{display:flex;align-items:flex-start;gap:10px;margin:0 0 18px}
      .rg26-card-status>.rg26-dot{margin-top:8px;width:7px;height:7px;background:var(--rg26-accent)}
      .rg26-card-status[data-tone=off]>.rg26-dot{background:var(--dsw-alias-label-tertiary)}
      .rg26-card-status[data-tone=warn]>.rg26-dot{background:var(--dsw-alias-state-warn-primary,#e5b66e)}
      .rg26-card-status strong{display:block;font-size:17px;line-height:26px;font-weight:600}
      .rg26-card-status p{margin:4px 0 0;font-size:12px;line-height:19px;color:var(--rg26-secondary)}
      .rg26-dialog .rg26-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:0;border:0;margin:0 0 18px;padding:0}
      .rg26-dialog .rg26-stat,.rg26-dialog .rg26-stat:first-child{padding:0;border:0}
      .rg26-dialog .rg26-stat+.rg26-stat{padding-left:24px;border-left:1px solid var(--rg26-line)}
      .rg26-dialog .rg26-stat dt{font-size:12px;line-height:20px}
      .rg26-dialog .rg26-stat dd{font-size:28px;line-height:36px;font-weight:600;margin-top:2px}
      .rg26-card-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--rg26-line);padding-top:14px;font-size:12px;color:var(--rg26-secondary)}
      .rg26-card-mode{display:flex;gap:6px;align-items:center;color:var(--rg26-accent)}
      .rg26-card-footer time{font-size:11px;font-variant-numeric:tabular-nums}
      .rg26-card-details{margin-top:14px}
      .rg26-card-details>summary{cursor:pointer;font-size:12px;color:var(--rg26-secondary);padding:4px 0}
      .rg26-card-details[open]>summary{color:var(--rg26-accent);margin-bottom:12px}
      .rg26-dialog .rg26-detail-body{padding-top:2px}
      .rg26-dialog .rg26-detail-body .rg26-stats{margin:12px 0}
      .rg26-dialog .rg26-detail-body .rg26-stat dd{font-size:20px;line-height:28px}
      .rg26-dialog .rg26-events{margin-top:8px}
      .rg26-dialog .rg26-event{padding:12px 0}
      .rg26-dialog .rg26-event:last-child{border-bottom:0}
      .rg26-dialog .rg26-fact{font-size:12px;gap:12px;padding:9px 0;border-bottom:1px solid var(--rg26-line)}
      .rg26-dialog .rg26-note{font-size:11px;line-height:19px;margin-bottom:0}
      .rg26-dialog .rg26-live{line-height:20px}
      .rg26-dialog :focus-visible{outline:2px solid var(--rg26-accent);outline-offset:3px}
      .rg26-root :focus-visible,.rg26-dock-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
      .rg26-toast{position:fixed;right:20px;bottom:20px;z-index:1000;width:min(360px,calc(100vw - 40px));padding:14px 16px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg,8px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-prominent,0 6px 24px #0002)}
      .rg26-toast p{margin:5px 0 10px;font-size:12px;color:var(--dsw-alias-label-secondary)}
      @keyframes rg26-page-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes rg26-detail-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}
      @container rg26-panel (max-width:1050px){.rg26-workspace{padding:20px 24px 12px;gap:16px}.rg26-header-tools .rg26-switch{margin-right:4px}.rg26-monitor{gap:20px}.rg26-monitor-section+.rg26-monitor-section{padding-left:20px}}
      @container rg26-panel (max-width:1000px){.rg26-overview{gap:20px}.rg26-root .rg26-overview .rg26-stats{gap:18px;max-width:360px}.rg26-overview h3{font-size:19px}.rg26-workspace{padding:22px 24px 12px}.rg26-tabpanel[data-view=settings] .rg26-settings{gap:24px}.rg26-tabpanel[data-view=settings] .rg26-settings>.rg26-section:first-child{padding-left:24px}.rg26-settings .rg26-mode-options{grid-template-columns:1fr}.rg26-settings .rg26-mode-options label{min-height:56px;gap:2px;padding:9px 12px}}
      @container rg26-panel (max-width:860px){.rg26-tabs{gap:20px}.rg26-workspace{padding:18px 24px 12px;gap:16px}.rg26-header-tools .rg26-switch{margin-right:8px}.rg26-monitor-modes{display:flex;gap:4px;flex:none;background:var(--rg26-fill);padding:3px;border-radius:6px}.rg26-monitor-modes button{flex:1;min-height:30px;padding:4px 10px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer}.rg26-monitor-modes button[aria-pressed=true]{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--rg26-accent);box-shadow:0 1px 3px #0001}.rg26-monitor{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr);gap:0}.rg26-monitor-section+.rg26-monitor-section{border-left:0;padding-left:0}.rg26-monitor[data-pane=conversations]>.rg26-monitor-section:last-child,.rg26-monitor[data-pane=events]>.rg26-monitor-section:first-child{display:none}.rg26-root .rg26-overview .rg26-stats{max-width:none;width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.rg26-overview{align-items:flex-start;flex-direction:column;gap:20px;padding:8px 0 20px}.rg26-overview h3{font-size:19px}.rg26-tabpanel[data-view=settings] .rg26-settings{display:flex;gap:28px}.rg26-tabpanel[data-view=settings] .rg26-settings>.rg26-section:first-child{border:0;padding:0;order:3}.rg26-settings .rg26-mode-options{grid-template-columns:repeat(3,minmax(0,1fr))}.rg26-settings .rg26-mode-options label{min-height:78px;padding:10px 8px}.rg26-settings>.rg26-section{width:100%}.rg26-monitor .rg26-scroll>.rg26-empty{min-height:160px}.rg26-tabpanel[data-view=monitor]{gap:16px}.rg26-root .rg26-stat dd{font-size:24px;line-height:30px}.rg26-root .rg26-fact{grid-template-columns:130px minmax(0,1fr);gap:16px}.rg26-root .rg26-rules .rg26-fact{grid-template-columns:112px minmax(0,1fr)}}
      @container rg26-panel (max-width:520px){.rg26-workspace{padding:18px 14px 10px;gap:16px}.rg26-workspace>.rg26-head{flex-wrap:wrap;gap:10px}.rg26-head h2{font-size:18px;line-height:26px}.rg26-header-tools{width:100%;justify-content:flex-end}.rg26-header-tools .rg26-switch{margin-right:auto}.rg26-tabs{gap:0;justify-content:space-between;padding-bottom:10px}.rg26-tab{justify-content:center;padding:6px 7px;font-size:12px;gap:5px;min-height:36px}.rg26-tab svg{width:14px;height:14px}.rg26-overview-copy{gap:10px}.rg26-emblem{width:38px;height:38px}.rg26-overview p{font-size:11px}.rg26-root .rg26-overview .rg26-stat,.rg26-root .rg26-overview .rg26-stat:first-child{padding:0}.rg26-root .rg26-overview .rg26-stat dd{font-size:24px}.rg26-root .rg26-stats{gap:6px}.rg26-root .rg26-stat,.rg26-root .rg26-stat:first-child{padding:9px 8px}.rg26-root .rg26-stat dt{font-size:11px;line-height:17px}.rg26-root .rg26-stat dd{font-size:22px;line-height:28px}.rg26-root .rg26-conversation{padding:13px}.rg26-conversation .rg26-tools{opacity:1}.rg26-root .rg26-conversation-meta{gap:1px 8px}.rg26-root .rg26-records .rg26-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.rg26-root .rg26-records .rg26-stat,.rg26-root .rg26-records .rg26-stat:first-child{padding:0}.rg26-root .rg26-fact{grid-template-columns:84px minmax(0,1fr);gap:12px;font-size:13px}.rg26-root .rg26-rules .rg26-fact{grid-template-columns:1fr;gap:6px}.rg26-root .rg26-rules dt{font-weight:600}.rg26-root .rg26-event-head{gap:0 8px}.rg26-root .rg26-event{padding:10px 4px}.rg26-settings{padding:4px 0 20px;gap:24px}.rg26-footer{font-size:12px;flex-wrap:wrap;gap:2px 8px;padding-top:8px}.rg26-footer time{font-size:11px}.rg26-settings .rg26-mode-options{gap:6px}.rg26-settings .rg26-mode-options strong{font-size:12px}.rg26-settings .rg26-mode-options small{font-size:10px}.rg26-settings .rg26-mode-options label{padding:10px 6px}.rg26-about strong{font-size:18px}.rg26-settings .rg26-section-head{flex-wrap:wrap;margin-bottom:10px}.rg26-settings .rg26-section-head h3{font-size:14px}.rg26-tabpanel[data-view=monitor]{gap:14px}.rg26-monitor{gap:14px}.rg26-setting-row:has(.rg26-model-modes){flex-wrap:wrap;gap:10px}}
      @media(max-width:560px){.rg26-dialog .rg26-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.rg26-dialog .rg26-stat:nth-child(3){border-left:0;padding-left:0}.rg26-dialog .rg26-stat:nth-child(n+3){border-top:.5px solid var(--dsw-alias-border-l2)}}
      @media(prefers-reduced-motion:reduce){.rg26-root *,.rg26-conversation .rg26-tools{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
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
    const parseVer = v => {
      const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v || '');
      return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? m[4].split('.').map(p => /^\d+$/.test(p) ? Number(p) : p) : []] : null;
    };
    const compareVer = (a, b) => {
      const pa = parseVer(a), pb = parseVer(b);
      if (!pa || !pb) return 0;
      for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
      if (!pa[3].length && !pb[3].length) return 0;
      if (!pa[3].length) return 1;
      if (!pb[3].length) return -1;
      for (let i = 0; i < Math.max(pa[3].length, pb[3].length); i++) {
        const x = pa[3][i], y = pb[3][i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        if (x === y) continue;
        if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
        if (typeof x === 'number') return -1;
        if (typeof y === 'number') return 1;
        return x > y ? 1 : -1;
      }
      return 0;
    };
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
      let state = { data: null, conversations: [], conversationError: '', sessions: Object.create(null), sessionErrors: Object.create(null), error: '', busy: false, test: '', toast: null, updatedAt: null, updates: null, updateError: '', updateBusy: false, modelScope: null, scopeError: '', scopeReadError: '', scopeLoading: false, logging: null, loggingError: '', loggingReadError: '' };
      const listeners = new Set(), requests = new Set(), downloads = new Map(), watched = new Map();
      let disposed = false, generation = 0, updateGeneration = 0, lastNotice = '', activeTab = '', panelMounted = false;
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
        const event = data.events.find(e => (!data.startedAt || !e.time || Date.parse(e.time) >= Date.parse(data.startedAt)) && (e.kind === 'internal-error' || e.kind === 'tool-repeat' || (e.kind === 'stream-repeat' && (e.confirmed || e.uncertainty)) || (e.kind === 'recovery' && e.action === 'recovery-submitted')));
        const id = event ? `${event.session}/${event.time}/${event.kind}/${event.contentType || ''}/${event.action || ''}/${event.repeats || ''}` : '';
        const patch = { data, error: '', updatedAt: new Date().toISOString() };
        if (id && id !== lastNotice) { patch.toast = event; lastNotice = id; }
        publish(patch);
      }

      // Reusable guarded poller: deduplicates in-flight requests and resyncs when generation advances mid-flight.
      function makePoller(getGen, isBusy, run) {
        const active = new Set();
        const trigger = async (key = '', arg) => {
          if (disposed || isBusy() || active.has(key)) return;
          active.add(key);
          const current = getGen();
          try { await run(current, arg); }
          finally {
            active.delete(key);
            if (!disposed && current !== getGen() && (key === '' || watched.has(key))) void trigger(key, arg);
          }
        };
        return trigger;
      }

      const idToHash = new Map(), hashToId = new Map();
      async function resolveConversations(items) {
        if (!items.some(item => !item.sessionId) || !window.crypto?.subtle || !window.TextEncoder) return items;
        const catalog = (ctx.get?.('sessions') ?? ctx.sessions)?.list?.getSnapshot?.().byId ?? {};
        const missing = Object.keys(catalog).filter(id => !idToHash.has(id));
        if (missing.length) {
          const encoder = new window.TextEncoder();
          await Promise.all(missing.map(async id => {
            try {
              const bytes = await window.crypto.subtle.digest('SHA-256', encoder.encode(id));
              const hex = Array.from(new Uint8Array(bytes).slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
              if (idToHash.size >= 4096) {
                const oldestId = idToHash.keys().next().value;
                const oldestHash = idToHash.get(oldestId);
                idToHash.delete(oldestId); hashToId.delete(oldestHash);
              }
              idToHash.set(id, hex); hashToId.set(hex, id);
            } catch {}
          }));
        }
        return items.map(item => item.sessionId ? item : { ...item, sessionId: hashToId.get(item.sessionKey) || '' });
      }

      const refresh = makePoller(() => generation, () => state.busy, async current => {
        try { const data = await call('snapshot'); if (generation === current) accept(data); }
        catch { if (generation === current) publish({ error: '监控服务未连接' }); }
      });

      const refreshConversations = makePoller(() => generation, () => state.busy, async current => {
        try { const value = await call('conversations'); const items = await resolveConversations(Array.isArray(value) ? value : []); if (generation === current) publish({ conversations: items, conversationError: '' }); }
        catch { if (generation === current) publish({ conversationError: '对话列表未连接，请刷新重试。' }); }
      });

      const refreshLogging = makePoller(() => generation, () => state.busy, async current => {
        try { const value = await call('diskLogging'); if (current === generation && typeof value?.available === 'boolean') publish({ logging: value, loggingReadError: '' }); }
        catch { if (current === generation) publish({ loggingReadError: '日志设置未同步，请刷新重试。' }); }
      });

      const refreshScope = makePoller(() => generation, () => state.busy, async (current, catalog = false) => {
        if (catalog) publish({ scopeLoading: true });
        try {
          const value = await call(catalog ? 'refreshModels' : 'modelScope');
          if (current === generation && ['all', 'selected'].includes(value?.scope) && Array.isArray(value.selections)) publish({ modelScope: value, scopeReadError: '' });
        } catch { if (current === generation) publish({ scopeReadError: '监控范围未同步，请重试。' }); }
        finally { if (catalog) publish({ scopeLoading: false }); }
      });

      const refreshUpdates = makePoller(() => updateGeneration, () => state.updateBusy, async current => {
        try { const value = await call('updates'); if (current === updateGeneration && value && typeof value.currentVersion === 'string') publish({ updates: value, updateError: '' }); }
        catch { if (current === updateGeneration) publish({ updateError: '更新服务未连接' }); }
      });

      const refreshSession = makePoller(() => generation, () => state.busy, async (current, id) => {
        try {
          const value = await call('session', { sessionId: id });
          if (generation === current && watched.has(id)) publish({ sessions: { ...state.sessions, [id]: value }, sessionErrors: { ...state.sessionErrors, [id]: '' } });
        } catch { if (generation === current && watched.has(id)) publish({ sessionErrors: { ...state.sessionErrors, [id]: '会话监控未连接' } }); }
      });

      async function updateAction(endpoint, payload) {
        if (disposed || state.updateBusy) return;
        updateGeneration++; publish({ updateBusy: true, updateError: '' });
        try { publish({ updates: await call(endpoint, payload) }); }
        catch { publish({ updateError: '更新操作未完成，请检查状态后重试。' }); }
        finally { updateGeneration++; publish({ updateBusy: false }); void refreshUpdates(); }
      }

      function syncActiveTab() {
        if (!panelMounted) return;
        if (activeTab === 'monitor') void refreshConversations();
        if (activeTab === 'settings') { void refreshScope('', false); void refreshLogging(); }
      }

      async function poll() {
        const tasks = [refresh(), ...[...watched.keys()].map(id => refreshSession(id, id))];
        if (panelMounted && activeTab === 'monitor') tasks.push(refreshConversations());
        if (panelMounted && activeTab === 'settings') tasks.push(refreshScope('', false), refreshLogging());
        if (panelMounted && activeTab === 'updates') tasks.push(refreshUpdates());
        await Promise.all(tasks);
      }

      function setPanelView(mounted, tab) {
        const prevTab = activeTab;
        panelMounted = mounted;
        activeTab = mounted ? tab : '';
        if (!mounted || prevTab === tab) return;
        syncActiveTab();
        if (tab === 'updates') void refreshUpdates();
      }

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
          if (endpoint === 'setDiskLogging') publish({ logging: value, loggingError: '', data: state.data ? { ...state.data, logging: value } : null });
          if (endpoint === 'selfTest') publish({ test: value.passed && value.modelRequests === 0 ? '离线自检通过，未调用模型，未计入真实告警。' : '离线自检未通过。' });
          if (endpoint === 'export') {
            const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
            if (downloads.size >= 10) { const [old, timer] = downloads.entries().next().value; clearTimeout(timer); URL.revokeObjectURL(old); downloads.delete(old); }
            downloads.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60000));
            const a = document.createElement('a'); a.href = url; a.download = 'runtime-guard-diagnostics.json'; document.body.appendChild(a); a.click(); a.remove();
          }
        } catch { publish(endpoint === 'setDiskLogging' ? { loggingError: '日志设置保存失败，原设置仍然生效。请重试。' } : endpoint === 'setOperationSafety' ? { safetyError: '操作防护设置保存失败，原设置仍然生效。请重试。' } : endpoint === 'setModelScope' ? { scopeError: '范围保存失败，原设置仍然生效。请重试。' } : { error: '操作未完成，请重试。' }); }
        finally {
          generation++; publish({ busy: false });
          void refresh();
          syncActiveTab();
          for (const id of watched.keys()) void refreshSession(id, id);
        }
      }

      const onVisibility = () => { if (document.visibilityState !== 'hidden' && !disposed) void poll(); };
      document.addEventListener?.('visibilitychange', onVisibility);
      const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void poll(); }, 2000); void refresh();
      return {
        subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, snapshot: () => state, refresh: poll, setPanelView, refreshModels: () => refreshScope('', true), action, updateAction,
        watch: id => { watched.set(id, (watched.get(id) || 0) + 1); void refreshSession(id, id); return () => { const count = watched.get(id) - 1; if (count) watched.set(id, count); else { watched.delete(id); const { [id]: _old, ...sessions } = state.sessions; const { [id]: _error, ...sessionErrors } = state.sessionErrors; publish({ sessions, sessionErrors }); } }; },
        dismiss: () => publish({ toast: null }),
        dispose: () => { disposed = true; clearInterval(timer); document.removeEventListener?.('visibilitychange', onVisibility); for (const request of requests) request.abort(); for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); } downloads.clear(); watched.clear(); listeners.clear(); },
      };
    }
    function apply(ctx) {
      const tag = document.createElement('style'); tag.dataset.pluginCss = 'dsh-runtime-guard'; tag.textContent = css; document.head.appendChild(tag);
      const controller = createController(ctx); ctx.effect(() => () => { controller.dispose(); tag.remove(); });
      const useState = () => React.useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
      const icon = (Component, size = 14) => Component ? h(Component, { size, 'aria-hidden': true }) : null;
      const command = (label, onClick, Icon, disabled, onlyIcon = false) => h(UI.Button, { type: 'button', variant: 'ghost', size: 'sm', className: onlyIcon ? 'rg26-icon-button' : 'rg26-action', title: label, 'aria-label': label, onClick, disabled, icon: icon(Icon) }, onlyIcon ? null : label);
      const status = (text, tone = 'on') => h('span', { className: 'rg26-state', 'data-tone': tone }, h('i', { className: 'rg26-dot', 'aria-hidden': true }), text);
      const stat = (label, value) => h('div', { className: 'rg26-stat', key: label }, h('dt', null, label), h('dd', null, value));
      const fact = (label, value) => h('div', { className: 'rg26-fact', key: label }, h('dt', null, label), h('dd', null, value));
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
          h('div', { className: 'rg26-live' }, h('span', null, `第 ${live?.turn ?? data.turn ?? 0} 轮 · 步骤 ${live?.step ?? data.step ?? 0}`),
            live && h('span', null, `推理 ${live.reasoningChars.toLocaleString()} 字符`), live && h('span', null, `正文 ${live.textChars.toLocaleString()} 字符`),
            live && h('span', null, `已检查 ${live.checks} 次`), live && h('span', null, `检测文本 ${live.analyzedChars ?? 0} 字符`), h('span', null, `工具结果 ${data.toolResults ?? 0} 次`)),
          live && h('div', { className: 'rg26-live' }, h('span', null, `最近输出 ${time(live.lastOutputAt)}`),
            h('span', null, `最近检测 ${time(live.lastCheckAt)}`), live.active && h('span', null, `等待新输出 ${Math.floor(live.silentForMs / 1000)} 秒`)));
      }
      function Events({ events, mode, conversations = [] }) {
        return h('ol', { className: 'rg26-events' }, events.map((event, i) => {
          const text = explain(event, mode);
          return h('li', { className: 'rg26-event', key: `${event.session}/${event.time}/${i}` },
            h('div', { className: 'rg26-event-head' }, h('span', { className: 'rg26-event-title' }, text.title), h('time', null, time(event.time))),
            h('div', { className: 'rg26-event-context' }, event.session && (() => { const item = conversations.find(item => item.sessionKey === event.session); return h('button', { type: 'button', className: 'rg26-link', disabled: !item?.sessionId || !service('uiWorkspace')?.openSession, onClick: () => openConversation(item) }, item ? conversationName(item) : `对话 ${event.session.slice(0, 8)}`); })(),
              event.turn !== undefined && h('span', { className: 'rg26-tag' }, `第 ${event.turn} 轮${event.step === undefined ? '' : ` · 步骤 ${event.step}`}`)),
            h('p', { className: 'rg26-result' }, text.result), text.reason && h('details', null, h('summary', null, '检测依据'), h('div', { className: 'rg26-detail-body' }, h('p', null, text.reason))));
        }));
      }
      function Panel({ view, embedded = false } = {}) {
        const state = useState(), data = state.data, online = data && !state.error;
        const [filter, setFilter] = React.useState(''), [tab, setTab] = React.useState('monitor'), [query, setQuery] = React.useState(''), [pane, setPane] = React.useState('conversations');
        const eventRegion = React.useRef(null), id = React.useId();
        React.useEffect(() => service('sessions')?.list?.subscribe?.(() => controller.refresh()), []);
        React.useEffect(() => {
          if (view === 'summary') { controller.setPanelView(false, ''); return; }
          controller.setPanelView(true, tab);
          return () => controller.setPanelView(false, '');
        }, [view, tab]);
        React.useLayoutEffect(() => { if (eventRegion.current) eventRegion.current.scrollTop = 0; }, [filter]);
        const label = !online ? (state.error || '连接中') : data.monitoring ? '监控在线' : '监控已暂停';
        if (view === 'summary') return h('div', { className: 'rg26-summary' }, status(label, online && data.monitoring ? 'on' : 'off'), data && `已监控 ${data.monitoredRequests} 次 · 确认重复 ${data.confirmed} 次`);
        const events = data?.events.filter(e => e.kind !== 'compatibility' && (!filter || e.session === filter)) || [];
        const tabs = [['monitor', '实时监控', UI.IconGaugeOutlineRegular], ['safety', '操作防护', UI.IconShieldOutlineRegular], ['settings', '监控设置', UI.IconSettingsOutlineRegular], ['updates', '插件更新', UI.IconDownloadOutlineRegular]];
        const visible = state.conversations.filter(item => `${conversationName(item)} ${item.sessionKey}`.toLowerCase().includes(query.trim().toLowerCase()));
        const onTabKey = event => {
          const index = tabs.findIndex(([key]) => key === tab);
          const next = ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % tabs.length : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setTab(tabs[next][0]); event.currentTarget.querySelector(`[id="${id}-${tabs[next][0]}"]`)?.focus();
        };
        return h('section', { className: 'rg26-root', 'data-embedded': String(embedded), 'aria-label': '运行时护栏监控面板' }, h('div', { className: 'rg26-page' },
          h('main', { className: 'rg26-workspace', 'data-view': tab }, h('header', { className: 'rg26-head' }, h('div', { className: 'rg26-title' }, icon(UI.IconShieldOutlineRegular, 20), h('h2', null, '运行时护栏')),
            h('div', { className: 'rg26-tools rg26-header-tools' }, h('span', { className: 'rg26-switch' }, '启用监控', h(UI.Switch, { label: '启用监控', checked: Boolean(data?.monitoring), disabled: !online || state.busy, onChange: enabled => controller.action('setMonitoring', { enabled }) })),
              command('刷新状态', controller.refresh, UI.IconRefreshOutlineRegular, state.busy, true), command('离线自检', () => controller.action('selfTest'), UI.IconInfoOutlineRegular, !online || state.busy, true), command('导出诊断日志', () => controller.action('export'), UI.IconDownloadOutlineRegular, !online || state.busy, true))),
          h('nav', { className: 'rg26-tabs', role: 'tablist', 'aria-label': '护栏页面', 'aria-orientation': 'horizontal', onKeyDown: onTabKey }, ...tabs.map(([key, text, Icon]) => h('button', { key, id: `${id}-${key}`, type: 'button', role: 'tab', className: 'rg26-tab', 'aria-selected': tab === key, 'aria-controls': `${id}-content`, tabIndex: tab === key ? 0 : -1, onClick: () => setTab(key) }, icon(Icon, 16), h('span', null, text)))),
          state.error && h('p', { role: 'alert', className: 'rg26-error' }, state.error), state.test && h('p', { role: 'status', className: 'rg26-test' }, state.test),
          h('div', { key: tab, id: `${id}-content`, role: 'tabpanel', 'aria-labelledby': `${id}-${tab}`, className: 'rg26-tabpanel', 'data-view': tab },
          tab === 'monitor' && (data ? h(React.Fragment, null,
            h('section', { className: 'rg26-overview', 'aria-label': '监控概览' },
              h('div', { className: 'rg26-overview-copy' }, h('span', { className: 'rg26-emblem' }, icon(UI.IconShieldOutlineRegular, 25)), h('div', null,
                h('h3', null, !online ? '正在重新连接' : !data.monitoring ? '监控已暂停' : data.activeRequests ? '正在守护当前请求' : '护栏已就绪'),
                h('p', null, !online ? '等待监控服务同步状态' : !data.monitoring ? '恢复监控后继续检查新请求' : `${state.conversations.length} 个对话 · ${data.activeRequests} 个进行中的请求 · ${modeName(data.mode)}`))),
              h('dl', { className: 'rg26-stats' }, stat('已监控请求', data.monitoredRequests), stat('确认重复', data.confirmed), stat('已提交纠正', data.recoverySubmitted))),
            h('div', { className: 'rg26-monitor-modes', role: 'group', 'aria-label': '监控列表切换' }, ...[['conversations', '对话列表'], ['events', '检测记录']].map(([key, text]) => h('button', { key, type: 'button', 'aria-pressed': pane === key, onClick: () => setPane(key) }, text))),
            h('div', { className: 'rg26-monitor', 'data-pane': pane },
            h('section', { className: 'rg26-section rg26-monitor-section', 'aria-label': '逐对话实时监控' },
              h('div', { className: 'rg26-section-head' }, h('h3', null, '对话'), h('span', { className: 'rg26-muted', 'aria-live': 'polite' }, `${query.trim() ? `${visible.length} / ` : ''}${state.conversations.length} 个`)),
              h('div', { className: 'rg26-search' }, h('span', { className: 'rg26-search-icon' }, icon(UI.IconSearchOutlineRegular)), h('input', { type: 'search', value: query, placeholder: '搜索对话', 'aria-label': '搜索对话', onChange: event => setQuery(event.target.value) })),
              (state.error || state.conversationError) && h('p', { className: 'rg26-error' }, '连接中断，以下为上次同步数据，不能判断当前模型状态。'),
              h('div', { className: 'rg26-conversations rg26-scroll', role: 'region', 'aria-label': '对话列表', tabIndex: 0 }, visible.length ? visible.map(item => {
                const current = state.error || state.conversationError ? { label: '状态已过期 · 等待重新连接', tone: 'off' } : health(item);
                const paused = item.sessionEnabled === false || item.coverage === 'disabled';
                return h('article', { className: 'rg26-conversation', key: item.sessionKey, 'data-selected': filter === item.sessionKey },
                  h('div', { className: 'rg26-conversation-head' }, h('div', { className: 'rg26-conversation-title', title: conversationName(item) }, conversationName(item)),
                    h('div', { className: 'rg26-tools' }, command(paused ? '启用此对话监控' : '暂停此对话监控', () => controller.action('setSessionEnabled', { sessionId: item.sessionId, enabled: paused }), paused ? UI.IconPlayOutlineRegular : UI.IconPauseOutlineRegular, state.busy || !item.sessionId, true), command('查看此对话记录', () => { setFilter(item.sessionKey); setPane('events'); }, UI.IconInfoOutlineRegular, false, true), command('打开对话', () => openConversation(item), UI.IconLinkOutlineRegular, !item.sessionId || !service('uiWorkspace')?.openSession, true))),
                  status(current.label, current.tone),
                  h('div', { className: 'rg26-conversation-meta' }, h('span', null, `第 ${item.live?.turn ?? item.turn ?? 0} 轮 · 步骤 ${item.live?.step ?? item.step ?? 0}`), h('span', null, `确认重复 ${item.confirmed} 次`), h('span', null, `已提交纠正 ${item.recoverySubmitted} 次`)),
                  h('details', null, h('summary', null, '详情'), h('div', { className: 'rg26-detail-body' }, h(Live, { data: item }), h('p', { className: 'rg26-muted' }, `${item.counterScope === 'retained-events' ? '保留事件中' : '累计'}${item.cancelRequested ? `请求中断 ${item.cancelRequested} 次` : '未拦截、未中断'}`), !item.tracked && h('p', { className: 'rg26-muted' }, '历史记录；收到此对话的新请求后继续实时监控。'))));
              }) : h('div', { className: 'rg26-empty' }, query.trim() ? '没有匹配的对话' : '尚无已跟踪的对话')),
              h('p', { className: 'rg26-health-note' }, '“暂未发现循环”仅描述已收到的输出。')),
            h('section', { className: 'rg26-section rg26-monitor-section', 'aria-label': '检测与处理' }, h('div', { className: 'rg26-section-head' }, h('h3', null, '检测与处理'), h('span', { className: 'rg26-muted' }, `${events.length} 条记录`)),
              filter && h('div', { className: 'rg26-filter' }, h('span', { className: 'rg26-muted' }, conversationName(state.conversations.find(item => item.sessionKey === filter) || { sessionKey: filter })), command('显示全部对话', () => setFilter(''), UI.IconCloseOutlineRegular, false, true)),
              h('div', { className: 'rg26-scroll', role: 'region', 'aria-label': '检测记录', tabIndex: 0, ref: eventRegion }, events.length ? h(Events, { events, mode: data.mode, conversations: state.conversations }) : h('div', { className: 'rg26-empty' }, h('span', { className: 'rg26-empty-icon' }, icon(UI.IconShieldOutlineRegular, 32)), h('span', null, '尚无检测记录'), h('small', null, '检测到重复或发生处理动作后，记录会显示在这里。')))))) : h('div', { className: 'rg26-empty' }, state.error || '正在连接监控服务')),
          tab === 'safety' && h('div', { className: 'rg26-settings' }, h(OperationSafety, { state })),
          tab === 'settings' && h('div', { className: 'rg26-settings' }, h(DiskLogging, { state }), data &&
            h('section', { className: 'rg26-section' }, h('div', { className: 'rg26-section-head' }, h('h3', null, '重复检测')),
              h('div', { className: 'rg26-setting-row rg26-mode-row' }, h('div', { className: 'rg26-setting-copy' }, h('strong', null, '处理模式'), h('small', null, '确认重复后执行的动作')),
              h('fieldset', { className: 'rg26-model-modes rg26-mode-options', disabled: !online || state.busy, 'aria-label': '处理模式选择' },
                ...[['observe', '仅观察', '记录并提醒'], ['guard', '防护停止', '请求停止重复推理'], ['assist', '有限纠正', '回合结束后尝试纠正']].map(([key, text, description]) => h('label', { key },
                  h('input', { type: 'radio', name: 'flash-mode', value: key, checked: data.mode === key, disabled: !online || state.busy || (key === 'guard' && data.compatibility?.guard === false), onChange: () => controller.action('setMode', { mode: key }) }), h('strong', null, text), h('small', null, description))))),
              data.compatibility?.guard === false && h('p', { className: 'rg26-note rg26-warn', role: 'status' },
                data.compatibility.reason === 'host-version-unverified'
                  ? `宿主包版本不一致（配置版本 ${data.compatibility.version || '未知'}），已回退到观察模式，「防护停止」不可用。`
                  : data.compatibility.reason === 'host-version-mismatch'
                    ? `当前宿主版本与配置（${data.compatibility.version || '未知'}）不一致，已回退到观察模式，「防护停止」不可用。`
                    : `当前宿主版本（${data.compatibility.version || '未知'}）尚未通过防护停止验证，「防护停止」暂不可用。`),
              h('dl', { className: 'rg26-facts' }, fact('检测后动作', data.mode === 'guard' ? '确认推理重复后请求停止本轮' : data.mode === 'assist' ? '回合结束后可提交纠正' : '显示告警，不中断输出'), fact('最近监控', time(data.lastMonitoredAt)))), h(ModelScope, { state })),
          tab === 'updates' && h('div', { className: 'rg26-settings' }, h(Updates, { state }))),
          h('footer', { className: 'rg26-footer rg26-muted' }, status(label, online && data.monitoring ? 'on' : 'off'), h('time', { dateTime: state.updatedAt || undefined }, `最近同步 ${time(state.updatedAt)}`)))));
      }
      function DiskLogging({ state }) {
        const value = state.logging, logging = state.data?.logging ?? value;
        return h('section', { className: 'rg26-section', 'aria-label': '磁盘日志与历史记录' },
          h('div', { className: 'rg26-section-head' }, h('h3', null, '磁盘日志与历史记录')),
          h('div', { className: 'rg26-setting-row' }, h('div', { className: 'rg26-setting-copy' }, h('strong', null, '启用磁盘日志'), h('small', null, '保存监控摘要与检测记录，重启 DSH 后自动恢复')),
            h(UI.Switch, { label: '启用磁盘日志', checked: Boolean(value?.enabled), disabled: !value?.available || Boolean(state.error || state.loggingReadError) || state.busy, onChange: enabled => controller.action('setDiskLogging', { enabled }) })),
          h('dl', { className: 'rg26-facts' }, fact('保存状态', !value ? '正在读取' : !logging?.enabled ? '未开启 · 新记录仅保留在内存' : logging.healthy ? '已开启 · 自动保存' : '写入失败 · 请检查目录权限或重试开关'),
            value?.directory && fact('保存目录', h('code', { style: { fontSize: '12px', userSelect: 'text' } }, value.directory)),
            value && fact('保留范围', `最近 ${value.limit} 条检测记录 / ${value.sessionLimit} 个对话摘要`)),
          h('p', { className: 'rg26-note' }, '仅保存统计、时间与匿名对话标识，不保存对话正文、推理、命令或工具参数。关闭后停止写入，已有文件保留；开启时保存当前内存中的记录。'),
          value && !value.persistent && h('p', { className: 'rg26-note' }, '当前环境无法保存开关状态；重启后按插件配置启用。'),
          value && !value.available && h('p', { className: 'rg26-error', role: 'alert' }, '无法获取 DSH 配置目录，请在插件配置中设置 logDir。'),
          logging?.restored > 0 && h('p', { className: 'rg26-note', role: 'status' }, '已从磁盘恢复历史记录，当前运行状态会重新检测。'),
          logging?.restoreError && h('p', { className: 'rg26-error', role: 'alert' }, '部分历史文件损坏或超出限制，已跳过无法读取的内容；当前监控继续运行。'),
          (state.loggingError || state.loggingReadError) && h('p', { className: 'rg26-error', role: 'alert' }, state.loggingError || state.loggingReadError));
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
        return h('section', { className: 'rg26-section', 'aria-label': '操作防护' },
          h('div', { className: 'rg26-section-head' }, h('h3', null, '工具执行检查'), status(state.error ? '状态未同步' : labels[value?.state] || '等待同步', value?.state === 'active' && !state.error ? 'on' : 'off')),
          h('div', { className: 'rg26-setting-row' }, h('div', { className: 'rg26-setting-copy' }, h('strong', null, '启用操作防护'), h('small', null, '跟随当前对话的权限模式')), h(UI.Switch, {
            label: '启用操作防护', checked: Boolean(value?.enabled), disabled: !value || Boolean(state.error) || state.busy,
            onChange: enabled => controller.action('setOperationSafety', { enabled }),
          })),
          h('p', { className: 'rg26-note' }, '按每个对话在输入框选择的权限模式检查，独立覆盖所有模型。暂停防空转监控或更改模型范围不影响操作防护。'),
          h('details', { className: 'rg26-policy' }, h('summary', null, '查看权限规则'), h('dl', { className: 'rg26-facts rg26-rules', 'aria-label': '三种权限模式的放行与拦截规则' },
            fact('仅查看', '放行读取；拒绝明确的写入、编辑、删除；无法确认用途的执行请求单次审批。'),
            fact('仅工作区修改', '放行工作区内普通编辑、Python / Node 脚本及构建测试；越界写入、删除和未知执行请求单次审批；拒绝系统提权。'),
            fact('完全权限', '插件不额外拦截或审批工具调用，交由 DSH 原生工具与系统权限处理。')),
          h('p', { className: 'rg26-note' }, '受限模式下，交互终端当前目录和输入缓冲无法可靠确认，发送输入（包括空回车）需单次审批；中断控制键放行。普通脚本优先使用 pwsh / bash。')),
          state.safetyError && h('p', { className: 'rg26-error', role: 'alert' }, state.safetyError),
          value?.enabled && value.state === 'blocked' && h('p', { className: 'rg26-error', role: 'alert' },
            value.reason === 'host-unverified'
              ? `此宿主版本尚未验证（当前：${value.hostVersion || 'unknown'}；已验证：${(value.verifiedHosts || []).join('、') || '无'}），受保护工具已阻止；可关闭操作防护恢复宿主原有行为。`
              : (rules[value.reason] || '防护暂不可用，受保护工具已阻止；可关闭操作防护恢复宿主原有行为。')),
          value && h(React.Fragment, null,
            h('div', { className: 'rg26-records' }, h('h3', null, '检查记录'), h('dl', { className: 'rg26-stats' }, stat('已检查', value.checked), stat('已阻止 / 未获批准', value.denied), stat('审批请求', value.approvalRequests), stat('单次批准', value.approved)),
            value.events.length ? h('ol', { className: 'rg26-events rg26-section-scroll', 'aria-label': '操作防护记录', tabIndex: 0 }, ...value.events.slice(0, 20).map((event, index) => h('li', { key: `${event.time}-${index}`, className: 'rg26-event' },
              h('strong', null, `${actions[event.action] || event.action} · ${event.tool}`),
              h('p', null, rules[event.rule] || event.rule), h('small', { className: 'rg26-muted' }, `${time(event.time)} · ${event.session} · ${event.mode}`)))) : h('p', { className: 'rg26-empty' }, '尚无操作防护记录。')),
            h('p', { className: 'rg26-note' }, '完整命令和参数在 DSH 原生审批中展示。此处及诊断导出仅保留原因与结果，不保存命令正文。'),
            h('details', null, h('summary', null, '环境与覆盖工具'), h('div', { className: 'rg26-detail-body' }, h('dl', { className: 'rg26-facts' }, fact('宿主版本', value.hostVersion), fact('设置保存', value.persistent ? '重启后保留' : '仅本次运行')), h('p', { className: 'rg26-note' }, `覆盖工具：${value.coveredTools.join('、')}。权限服务或执行前接口异常时会显示原因并阻止受保护调用。操作防护不能代替系统沙盒。`)))));
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
        return h('section', { className: 'rg26-section', 'aria-label': '模型监控范围' },
          h('div', { className: 'rg26-section-head' }, h('h3', null, '监控范围'), command('刷新模型列表', controller.refreshModels, UI.IconRefreshOutlineRegular, disabled || state.scopeLoading)),
          h('p', { className: 'rg26-note' }, value ? `当前生效：${value.scope === 'all' ? '全部模型（所有渠道）' : `仅选中的 ${value.selections.length} 个模型`}` : '正在读取监控范围'),
          h('fieldset', { className: 'rg26-model-modes', disabled, 'aria-label': '监控模式' },
            ...[['all', '全部模型'], ['selected', '仅选中的模型']].map(([key, label]) => h('label', { key },
              h('input', { type: 'radio', name: 'flash-model-scope', value: key, checked: scope === key, onChange: () => setDraft({ scope: key, selections }) }), label))),
          scope === 'selected' && h(React.Fragment, null,
            h('input', { className: 'rg26-model-search', type: 'search', value: query, placeholder: '搜索模型或渠道', 'aria-label': '搜索模型或渠道', onChange: event => setQuery(event.target.value) }),
            h('div', { className: 'rg26-model-list' }, filtered.length ? filtered.map(item => h('label', { className: 'rg26-model-option', key: id(item) },
              h('input', { type: 'checkbox', checked: chosen.has(id(item)), disabled, onChange: event => select(item, event.target.checked), 'aria-label': `${item.providerLabel} / ${item.model}` }),
              h('span', null, item.label, h('small', null, `${item.providerLabel} · ${item.model}`))))
              : h('p', { className: 'rg26-muted' }, '暂无匹配模型。可刷新列表，或在宿主中使用一次该模型后再选择。')),
            !selections.length && h('p', { className: 'rg26-note' }, '尚未选择模型；保存后将不监控任何模型。')),
          value?.catalogError && h('p', { className: 'rg26-note' }, '部分渠道暂未返回模型列表，仍可选择已保存或已使用的模型。'),
          value?.loadError && h('p', { className: 'rg26-error' }, '上次保存的范围无法读取，当前使用配置中的范围，请重新保存。'),
          state.scopeError && h('p', { className: 'rg26-error', role: 'alert' }, state.scopeError),
          state.scopeReadError && h('p', { className: 'rg26-error', role: 'alert' }, state.scopeReadError),
          command('保存监控范围', save, UI.IconCheckOutlineRegular, disabled || !draft),
          h('p', { className: 'rg26-note' }, `${value?.persistent ? '选择保存在当前配置环境，重启后保留。' : '此宿主未提供设置存储，选择仅在本次运行生效。'}取消选择立即停止跟踪并撤销待执行纠正；新加入的模型从下一次请求开始监控。`));
      }
      function Updates({ state }) {
        const value = state.updates;
        const newerThanStable = value?.currentVersion && value?.latestVersion && compareVer(value.currentVersion, value.latestVersion) > 0;
        const phases = { unavailable: '此宿主不支持在线更新', idle: '尚未检查', checking: '正在检查', current: '已是最新正式版', available: '有新版本', 'waiting-idle': '等待所有对话空闲后安装', downloading: '正在下载并校验', installing: '正在交给 DSH 安装', 'restart-required': '已安装，需重启 DSH 生效', error: '更新未完成' };
        const errors = {
          'github-auth-or-release': '公开 Release 暂不可访问或尚未发布，请稍后重试。',
          'github-denied': 'GitHub 暂时限制了访问，且公开更新清单暂不可用，请稍后重试。',
          'invalid-release': 'Release 更新信息格式不正确，未安装。',
          'missing-artifact': 'Release 缺少安装包或校验值。',
          'checksum-failed': '安装包 SHA-256 校验失败，未安装。',
          'incompatible-host': '新版本不支持当前 DSH 或 Node.js，未安装。',
          'host-store-mismatch': 'DSH 的 pnpm 仓库路径与现有依赖不一致。请在当前 profile 的 pnpm-workspace.yaml 中将 storeDir 指向原仓库根目录，再检查更新重试；具体路径见 DSH 原生插件页的安装日志。',
          'host-store-config': '无法确认或保存现有 pnpm 仓库配置，已停止安装。请检查 profile 的 pnpm-workspace.yaml 与 node_modules/.modules.yaml；原配置保持不变。',
          'host-profile-busy': '当前 profile 正在执行其他安装或修改配置，请等待完成后重试。',
          'legacy-update-package': '在线安装包尚未包含统一升级修复，已停止安装并保留当前版本，请等待维护者发布修复包。',
          'host-dependency-network': '安装时另一个 Git 依赖下载失败。请检查 DSH 的 Git 网络或代理配置，再检查更新重试。',
          'host-network': 'DSH 安装依赖时网络连接失败，请检查网络或代理后重试。',
          'host-timeout': 'DSH 安装依赖超时，请检查网络后重试。',
          'host-permission': 'DSH 没有写入依赖目录的权限，请检查文件权限或占用后重试。',
          'host-disk-full': '安装所在磁盘空间不足，请释放空间后重试。',
          'host-pnpm-missing': 'DSH 未找到 pnpm，请修复 DSH 自带运行环境后重试。',
          'host-build-blocked': 'DSH 安装的依赖需要构建批准，请查看原生插件页的安装日志。',
          'host-integrity': 'DSH 安装依赖时完整性校验失败，请查看原生插件页的安装日志。',
          'host-already-installed': 'DSH 拒绝重复安装，请完全退出 DSH 后通过原生插件安装命令升级。',
          'host-version-mismatch': 'DSH 返回的安装版本与目标版本不一致，请在原生插件页确认实际版本。',
          'host-install-failed': 'DSH 未确认安装成功，请查看原生插件页的安装日志。',
          'storage-failed': '无法保存更新设置，自动更新未开启。',
          'install-scripts': '安装包声明安装脚本，已拒绝自动安装。',
        };
        const busy = state.updateBusy || ['checking', 'downloading', 'installing', 'restart-required'].includes(value?.phase);
        return h('section', { className: 'rg26-section', 'aria-label': '插件更新' },
          h('div', { className: 'rg26-about' }, icon(UI.IconShieldOutlineRegular, 36), h('div', null, h('strong', null, 'DSH 运行时护栏'), h('small', null, `版本 ${value?.currentVersion || '读取中'}`))),
          h('div', { className: 'rg26-section-head' }, h('h3', null, '版本与更新'),
            h('a', { className: 'rg26-link', href: 'https://github.com/MyRemme/dsh-runtime-guard', target: '_blank', rel: 'noopener noreferrer', title: '打开 GitHub 仓库' }, icon(UI.IconLinkOutlineRegular), ' GitHub 仓库')),
          h('dl', { className: 'rg26-facts' }, fact('当前版本', value?.currentVersion || '读取中'), fact('最新正式版', value?.latestVersion || '尚未检查'), fact('更新状态', !state.updateError && value?.phase === 'current' ? h('span', { className: 'rg26-success' }, newerThanStable ? '当前版本高于最新正式版' : phases.current) : (state.updateError || phases[value?.phase] || '连接中')), fact('最近检查', time(value?.checkedAt))),
          h('div', { className: 'rg26-setting-row' }, h('div', { className: 'rg26-setting-copy' }, h('strong', null, '自动更新'), h('small', null, '在对话空闲时安装已校验的正式版')), h(UI.Switch, { label: '自动更新', checked: Boolean(value?.automatic), disabled: !value?.available || state.updateBusy, onChange: enabled => controller.updateAction('setAutomaticUpdates', { enabled }) })),
          h('div', { className: 'rg26-setting-actions' },
            command('检查更新', () => controller.updateAction('checkUpdates'), UI.IconRefreshOutlineRegular, !value?.available || busy),
            command('安装更新', () => controller.updateAction('installUpdate'), UI.IconDownloadOutlineRegular, !value?.available || busy || !['available', 'waiting-idle'].includes(value?.phase))),
          h('p', { className: 'rg26-note' }, '关闭自动更新会撤销等待中或下载中的自动安装；手动安装及已交给 DSH 的安装继续完成。排队中的手动安装固定所选版本，自动检查不会替换该任务。'),
          value?.error && h('p', { className: 'rg26-error', role: 'status' }, errors[value.error] || '下载、校验或安装未完成；当前版本继续保留，可检查更新后重试。'));
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
        const [headline, ...detail] = label.split(' · ');
        const description = detail.join(' · ') || (data?.coverage === 'checked' ? '已完成最近一次输出检查' : '等待新的模型输出');
        const shortTime = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '尚无';
        const Surface = UI.MenuSurface || 'section';
        return h('div', { className: 'rg26-dock', 'data-composer-stat': 'runtime-guard' },
          h('button', { type: 'button', className: 'rg26-dock-button', ref: anchor, 'data-tone': tone, title: '运行时护栏：' + label, 'aria-label': '运行时护栏：' + label, 'aria-expanded': open, 'aria-controls': open ? dialogId : undefined, 'aria-haspopup': 'dialog', onClick: () => setOpen(value => !value) }, icon(tone === 'warn' ? UI.IconWarningOutlineRegular : UI.IconShieldOutlineRegular, 12), h('span', { role: 'status' }, '护栏 · ' + label)),
          open && createPortal(h(Surface, { id: dialogId, role: 'dialog', 'aria-label': '此对话的防空转记录', className: 'rg26-dialog', ref: dialog, style: position },
            h('div', { className: 'rg26-dialog-scroll' },
            h('div', { className: 'rg26-head' }, h('h3', null, icon(UI.IconShieldOutlineRegular, 16), '运行时护栏'), h('div', { className: 'rg26-tools' }, data && command(data.sessionEnabled === false || data.coverage === 'disabled' ? '启用此对话监控' : '暂停此对话监控', () => controller.action('setSessionEnabled', { sessionId, enabled: data.sessionEnabled === false || data.coverage === 'disabled' }), data.sessionEnabled === false || data.coverage === 'disabled' ? UI.IconPlayOutlineRegular : UI.IconPauseOutlineRegular, state.busy, true), command('关闭', () => { setOpen(false); anchor.current?.focus(); }, UI.IconCloseOutlineRegular, false, true))),
            error ? h('p', { className: 'rg26-error' }, error) : data && h(React.Fragment, null,
              h('div', { className: 'rg26-card-status', 'data-tone': tone, role: 'status' }, h('i', { className: 'rg26-dot', 'aria-hidden': true }), h('div', null, h('strong', null, headline === '请求结束' ? '本轮请求已结束' : headline), h('p', null, description))),
              h('dl', { className: 'rg26-stats' }, stat('已监控请求', data.monitoredRequests), stat('确认重复', data.confirmed)),
              (data.cancelRequested > 0 || data.recoverySubmitted > 0) && h('p', { className: 'rg26-note rg26-warn' }, `已请求中断 ${data.cancelRequested} 次 · 已提交纠正 ${data.recoverySubmitted} 次`),
              h('div', { className: 'rg26-card-footer' }, h('span', { className: 'rg26-card-mode' }, icon(UI.IconShieldOutlineRegular, 13), modeName(data.mode)), h('time', { title: time(data.lastMonitoredAt), dateTime: data.lastMonitoredAt || undefined }, `最近监控 ${shortTime(data.lastMonitoredAt)}`)),
              h('details', { className: 'rg26-card-details' }, h('summary', null, '检查详情'), h('div', { className: 'rg26-detail-body' },
                h(Live, { data }),
                h('dl', { className: 'rg26-stats' }, stat('请求中断', data.cancelRequested), stat('已提交纠正', data.recoverySubmitted)),
                h('dl', { className: 'rg26-facts' }, fact('拦截动作', data.latestEvent?.action === 'stop-confirmed' ? `宿主已确认停止（累计请求中断 ${data.cancelRequested} 次）` : data.cancelRequested ? `已请求中断 ${data.cancelRequested} 次，需以宿主结果为准` : '无，未中断模型或工具'), fact('最近监控', time(data.lastMonitoredAt))),
                data.events.length ? h(Events, { events: data.events, mode: data.mode }) : h('p', { className: 'rg26-muted' }, data.coverage === 'checked' ? '最近已检查的输出中未发现符合规则的重复。' : '尚无检测事件。'),
                h('p', { className: 'rg26-note' }, '每 2 秒同步。暂未发现循环只描述已收到的输出，不能保证后续不会重复。开启磁盘日志后，计数与历史在重启后恢复；详情取自全局最近 100 条事件。')))))), document.body));
      }
      function Icon() {
        const { data, error } = useState();
        return h('span', { className: 'rg26-icon', title: error || `运行时护栏 · ${data?.monitoring ? '在线' : '暂停'}` }, icon(UI.IconShieldOutlineRegular, 20), h('i', { className: 'rg26-dot', style: { background: error || data?.confirmed ? 'var(--dsw-alias-state-warn-primary)' : undefined } }));
      }
      function Toast() {
        const { toast, data } = useState(); if (!toast) return null;
        const text = explain(toast, data?.mode);
        return h('aside', { className: 'rg26-toast', role: 'alert' }, h('strong', null, '护栏 · ' + text.title), h('p', null, text.result), h('div', { className: 'rg26-row' }, command('查看记录', () => { ctx.layout.selectPanel(PANEL); controller.dismiss(); }, UI.IconInfoOutlineRegular), command('关闭', controller.dismiss, UI.IconCloseOutlineRegular, false, true)));
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
