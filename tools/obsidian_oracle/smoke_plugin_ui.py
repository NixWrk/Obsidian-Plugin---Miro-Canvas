"""Real browser DOM checks against a synthetic native host (not Obsidian QA)."""
from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[2]
BUNDLE_FIXTURE = (
    "require('esbuild').buildSync({"
    "entryPoints: [process.argv[1]], bundle: true, platform: 'browser', outfile: process.argv[2]"
    "})"
)
EDGE_PATH = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the synthetic Miro Canvas browser UI smoke test.")
    parser.add_argument("--browser", choices=("playwright", "edge"), default="playwright")
    parser.add_argument("--edge", type=Path, default=EDGE_PATH)
    parser.add_argument("--interactions", action="store_true", help="Focused clipboard and selection interaction regression.")
    parser.add_argument("--controls", action="store_true", help="Connector menus, marquee and first-press comment drag.")
    parser.add_argument("--screenshots", type=Path, help="Optional controls screenshots directory.")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="miro-plugin-ui-") as temporary:
        bundle = Path(temporary) / "fixture.js"
        # Through esbuild's JavaScript API: on Linux and macOS npm replaces
        # node_modules/esbuild/bin/esbuild with the native binary, which node
        # cannot run as a script.
        subprocess.run([
            "node", "-e", BUNDLE_FIXTURE,
            str(REPO / "tools/obsidian_oracle/fixtures/m1-browser.ts"), str(bundle),
        ], cwd=REPO, check=True)
        with sync_playwright() as playwright:
            launch_options: dict[str, object] = {"headless": True}
            if args.browser == "edge":
                if not args.edge.is_file():
                    raise RuntimeError(f"Microsoft Edge executable is missing: {args.edge}")
                launch_options["executable_path"] = str(args.edge)
            browser = playwright.chromium.launch(**launch_options)
            page = browser.new_page(viewport={"width": 1600, "height": 900})
            page.set_default_timeout(5000)
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.set_content("<!doctype html><html><body></body></html>")
            page.add_style_tag(path=str(REPO / "styles.css"))
            page.add_script_tag(path=str(bundle))
            assert page.evaluate("miroBrowser.mounted"), "M1 controls did not mount on real DOM"
            if args.controls:
                # Outside-close must run before Select consumes the board press.
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  s.resetTools();
                  const add=window.addEventListener;let outside;
                  window.addEventListener=function(type,listener,options){
                    if(type==='pointerdown'&&options===true)outside=listener;
                    return Reflect.apply(add,this,[type,listener,options]);
                  };
                  try{s.composeComment({x:300,y:240},{x:300,y:240});}
                  finally{window.addEventListener=add;}
                  if(!s.commentCard.composingComment)throw Error('Comment draft did not open');
                  if(typeof outside!=='function')throw Error('Outside-close did not use the owning window');
                  outside.call(window,{target:window});
                  if(s.commentCard.element.hidden)throw Error('Window-target event closed the board comment');
                  const other=document.body.appendChild(document.createElement('div'));
                  other.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:991,bubbles:true}));
                  if(s.commentCard.element.hidden)throw Error('Another pane closed the board comment');
                  other.remove();
                  s.commentCard.element.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:992,bubbles:true}));
                  if(s.commentCard.element.hidden)throw Error('Comment card closed itself');
                  b.root.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerType:'mouse',pointerId:993,clientX:1100,clientY:700,bubbles:true,cancelable:true}));
                  if(!s.commentCard.element.hidden)throw Error('Select swallowed comment outside-close');
                  window.dispatchEvent(new PointerEvent('pointerup',{button:0,pointerType:'mouse',pointerId:993,clientX:1100,clientY:700,bubbles:true}));
                  if(b.root.querySelectorAll('.miro-canvas-rectangle-marquee:not([hidden])').length)throw Error('Outside-close left a marquee');
                }""")
                page.evaluate("document.querySelector('.miro-canvas-dock__map').hidden = false")
                page.locator('.miro-canvas-dock button[aria-label="Board settings"]').click()
                page.evaluate("""() => {
                  const menu = document.querySelector('.miro-canvas-dock__menu--board');
                  for (const item of menu.querySelectorAll('[role=menuitem]')) {
                    const box = item.getBoundingClientRect();
                    if (!box.width) continue;
                    const hit = document.elementFromPoint(box.left+box.width/2, box.top+box.height/2);
                    if (!menu.contains(hit)) throw Error('Minimap covers board menu: '+item.textContent);
                  }
                }""")
                page.locator('.miro-canvas-dock button[aria-label="Board settings"]').click()
                # Russian arrangement instructions must leave Done reachable on a phone.
                board_width = page.evaluate("miroBrowser.root.style.width")
                page.set_viewport_size({"width": 384, "height": 853})
                page.evaluate("""() => {
                  const b = miroBrowser;
                  b.root.style.width = '384px';
                  b.session.toggleArrangeMode();
                  b.root.querySelector('.miro-canvas-arrange-banner__text').textContent = 'Перетаскивайте панели и инструменты';
                  const buttons = b.root.querySelectorAll('.miro-canvas-arrange-banner__button');
                  buttons[0].textContent = 'Вернуть как было';
                  buttons[1].textContent = 'Готово';
                }""")
                page.evaluate("""() => {
                  for(const control of document.querySelectorAll('.miro-canvas-arrange-grip,.miro-canvas-arrange-flip')) {
                    const rect=control.getBoundingClientRect();
                    if(rect.width===0 || rect.height===0) continue;
                    const hit=document.elementFromPoint(rect.left+rect.width/2, rect.top+rect.height/2);
                    if(!hit || !control.contains(hit)) throw Error('Another panel covers an arrange control: '+control.className);
                  }
                }""")
                done = page.locator('.miro-canvas-arrange-banner__button--done')
                bounds = done.bounding_box()
                assert bounds and bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 384, bounds
                done.click()
                assert page.locator('.miro-canvas-arrange-banner').count() == 0
                page.evaluate("(width) => miroBrowser.root.style.width = width", board_width)
                page.set_viewport_size({"width": 1600, "height": 900})
                page.evaluate("miroBrowser.session.toggleArrangeMode()")
                for anchor in ("left-middle", "right-middle", "top-center", "bottom-center"):
                    vertical = anchor.endswith("middle")
                    page.evaluate("""({anchor, vertical}) => {
                      miroBrowser.session.commitPanelPosition('toolbar', {
                        anchor, dx: 16, dy: 16, orientation: vertical ? 'vertical' : 'horizontal'
                      });
                    }""", {"anchor": anchor, "vertical": vertical})
                    page.wait_for_timeout(100)
                    page.evaluate("""(vertical) => {
                      const root = miroBrowser.root.getBoundingClientRect();
                      const tools = document.querySelector('.miro-canvas-tools').getBoundingClientRect();
                      const tray = document.querySelector('.miro-canvas-arrange-tray').getBoundingClientRect();
                      if(tray.left < root.left || tray.right > root.right || tray.top < root.top || tray.bottom > root.bottom)
                        throw Error('Spare tools leave the board');
                      const distance = vertical ? Math.max(tray.left-tools.right, tools.left-tray.right) : Math.max(tray.top-tools.bottom, tools.top-tray.bottom);
                      if(distance < 8 || distance > 65) throw Error('Spare tools are not next to the toolbar: '+distance);
                      const grip = document.querySelector('.miro-canvas-tools .miro-canvas-arrange-grip').getBoundingClientRect();
                      const flip = document.querySelector('.miro-canvas-tools .miro-canvas-arrange-flip').getBoundingClientRect();
                      if(grip.width < 44 || grip.height < 44 || flip.width < 44 || flip.height < 44 || flip.left-grip.right < 11)
                        throw Error('Drag and turn targets are too close or too small');
                      if(grip.left < root.left || flip.right > root.right) throw Error('Arrange controls leave the board');
                    }""", vertical)
                page.evaluate("miroBrowser.session.options.onToolbarItemsChanged = items => window.__arrangedItems = items")
                for orientation in ("horizontal", "vertical"):
                    page.evaluate("""(orientation) => {
                      miroBrowser.session.commitPanelPosition('toolbar', {
                        anchor: orientation === 'vertical' ? 'left-middle' : 'bottom-center',
                        dx:16, dy:16, orientation
                      });
                    }""", orientation)
                    page.wait_for_timeout(100)
                    source = page.locator('.miro-canvas-tools [data-tool="text"]').first.bounding_box()
                    target = page.locator('.miro-canvas-tools [data-tool="shape"]').first.bounding_box()
                    assert source and target
                    page.mouse.move(source['x'] + source['width']/2, source['y'] + source['height']/2)
                    page.mouse.down()
                    page.mouse.move(target['x'] + target['width']/2, target['y'] + target['height']/2, steps=8)
                    marker = page.locator('.miro-canvas-arrange-insertion')
                    assert marker.count() == 1 and marker.is_visible()
                    expected_index = int(marker.get_attribute('data-insert-index'))
                    line = marker.bounding_box()
                    assert line and (line['height'] == 3 if orientation == 'vertical' else line['width'] == 3), line
                    page.mouse.up()
                    assert page.locator('.miro-canvas-arrange-insertion').count() == 0
                    order = page.evaluate("window.__arrangedItems")
                    assert order.index('text') == expected_index, (order, expected_index)
                    grip = page.locator('.miro-canvas-tools .miro-canvas-arrange-grip').bounding_box()
                    assert grip
                    page.mouse.move(grip['x'] + grip['width']/2, grip['y'] + grip['height']/2)
                    page.mouse.down()
                    page.mouse.move(grip['x'] + grip['width']/2 + 50, grip['y'] + grip['height']/2 - 40, steps=8)
                    page.evaluate("""(vertical) => {
                      const tools = document.querySelector('.miro-canvas-tools').getBoundingClientRect();
                      const tray = document.querySelector('.miro-canvas-arrange-tray').getBoundingClientRect();
                      const distance = vertical ? Math.max(tray.left-tools.right, tools.left-tray.right) : Math.max(tray.top-tools.bottom, tools.top-tray.bottom);
                      if(distance < 8 || distance > 65) throw Error('Spare tools do not follow the drag preview: '+distance);
                    }""", orientation == 'vertical')
                    page.mouse.up()
                page.evaluate("""() => {
                  delete miroBrowser.session.options.onToolbarItemsChanged;
                  miroBrowser.session.toggleArrangeMode();
                  miroBrowser.session.commitPanelPosition('toolbar', {anchor:'bottom-center',dx:0,dy:12,orientation:'horizontal'});
                }""")
                page.evaluate("miroBrowser.session.toggleArrangeMode()")
                # Real browser touch input: dragging from a scrolling Plus menu must not be cancelled.
                page.evaluate("miroBrowser.session.options.onToolbarItemsChanged = items => window.__arrangedItems = items")
                page.evaluate("miroBrowser.session.commitPanelPosition('toolbar', {anchor:'left-middle',dx:16,dy:0,orientation:'vertical'})")
                page.locator('.miro-canvas-tools__more > button').click()
                spare = page.locator('.miro-canvas-tools__more [data-tool="code"]').bounding_box()
                destination = page.locator('.miro-canvas-tools > .miro-canvas-toolbar__bar > [data-tool="sticky"]').bounding_box()
                assert spare and destination
                sx, sy = spare['x']+spare['width']/2, spare['y']+spare['height']/2
                tx, ty = destination['x']+destination['width']/2, destination['y']+destination['height']/2
                touch = page.context.new_cdp_session(page)
                touch.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':sx,'y':sy,'id':41}]})
                for step in range(1, 21):
                    touch.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':sx+(tx-sx)*step/20,'y':sy+(ty-sy)*step/20,'id':41}]})
                    page.wait_for_timeout(20)
                assert page.locator('.miro-canvas-arrange-insertion').is_visible()
                touch.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
                page.wait_for_timeout(100)
                assert page.evaluate("window.__arrangedItems.includes('code')")
                assert page.locator('.miro-canvas-arrange-insertion').count() == 0
                touch.detach()
                page.evaluate("delete miroBrowser.session.options.onToolbarItemsChanged")
                # The button is the same pivot before and after folding, even at the board edges.
                for panel_id, selector in (("toolbar", ".miro-canvas-tools"), ("dockBar", ".miro-canvas-dock")):
                    for anchor in ("top-left", "top-right", "bottom-left", "bottom-right", "left-middle", "right-middle", "bottom-center"):
                        # Keep the other panel clear: overlapping bars cannot both receive the same tap.
                        if panel_id == "dockBar":
                            page.evaluate("miroBrowser.session.commitPanelPosition('toolbar', {anchor:'top-center',dx:0,dy:200,collapsed:true})")
                        page.evaluate("""({panel_id, anchor}) => miroBrowser.session.commitPanelPosition(panel_id, {
                          anchor, dx:24, dy:80, orientation: anchor.endsWith('middle') ? 'vertical' : 'horizontal'
                        })""", {"panel_id": panel_id, "anchor": anchor})
                        page.wait_for_timeout(50)
                        page.evaluate("""(selector) => {
                          const panel = document.querySelector(selector);
                          const pivot = panel.querySelector('.miro-canvas-panel-toggle').getBoundingClientRect();
                          const controls = panel.querySelectorAll('[data-tool], .canvas-card-menu-button, .miro-canvas-tools__more > button, .miro-canvas-dock__bar button');
                          for (const control of controls) {
                            if (control.classList.contains('miro-canvas-panel-toggle')) continue;
                            const box = control.getBoundingClientRect();
                            if (box.width && box.height && box.left < pivot.right && box.right > pivot.left && box.top < pivot.bottom && box.bottom > pivot.top) {
                              throw Error('Panel pivot overlaps a tool: '+control.getAttribute('aria-label'));
                            }
                          }
                        }""", selector)
                        button = page.locator(selector + ' .miro-canvas-panel-toggle')
                        for _ in range(2):
                            before = button.bounding_box()
                            assert before
                            button.click()
                            after = button.bounding_box()
                            assert after and abs(after['x']-before['x']) < 2 and abs(after['y']-before['y']) < 2, (anchor, before, after, page.evaluate("({layout:miroBrowser.session.settings.panelLayout,box:document.querySelector('.miro-canvas-tools').getBoundingClientRect().toJSON(),style:document.querySelector('.miro-canvas-tools').getAttribute('style')})"))
                        before = button.bounding_box()
                        assert before
                        page.mouse.move(before['x']+22, before['y']+22)
                        page.mouse.down()
                        page.wait_for_timeout(500)
                        page.mouse.move(before['x']+62, before['y']+52, steps=8)
                        page.mouse.up()
                        assert button.get_attribute('aria-expanded') == 'true'
                page.evaluate("""() => {
                  miroBrowser.session.toggleArrangeMode();
                  miroBrowser.session.commitPanelPosition('toolbar', {anchor:'bottom-center',dx:0,dy:12,orientation:'horizontal'});
                  miroBrowser.session.commitPanelPosition('dockBar', {anchor:'bottom-right',dx:12,dy:12,orientation:'horizontal'});
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser;
                  const map=b.root.querySelector('.miro-canvas-dock__map');
                  if(!map)throw Error('The separate minimap did not mount');
                  const hidden=map.hidden;
                  map.hidden=false;
                  const before=getComputedStyle(map).display;
                  if(before==='none')throw Error('The minimap is not visible before export');
                  b.root.classList.add('is-screenshotting');
                  if(getComputedStyle(map).display!=='none')throw Error('The minimap would be captured in an export');
                  b.root.classList.remove('is-screenshotting');
                  if(getComputedStyle(map).display!==before)throw Error('The minimap did not return after export');
                  map.hidden=hidden;
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser;b.session.resetTools();
                  b.session.writeBoardConnectors([{id:'menu-line',from:{type:'free',x:-200,y:100},to:{type:'free',x:100,y:100},route:'straight',color:'#334455',width:2,startCap:'none',endCap:'arrow'}]);
                  b.session.connectorLayer.select(['menu-line']);
                }""")
                toolbar = page.locator('.miro-canvas-toolbar').filter(has=page.get_by_role('button', name='Swap line ends', exact=True))
                assert toolbar.is_visible()
                toolbar.get_by_role('button', name='Add or edit line label', exact=True).click()
                label_editor = page.locator('.miro-canvas-connector-label[data-connector-id="menu-line"] .canvas-path-label')
                assert label_editor.get_attribute('contenteditable') == 'true', 'Drawn arrow has no label editor'
                label_editor.fill('First label')
                label_editor.press('Enter')
                assert page.evaluate("miroBrowser.runtime.getData().miroCanvas.connectors['menu-line'].label") == 'First label'
                page.evaluate("""() => {
                  const b=miroBrowser;
                  b.root.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
                }""")
                assert label_editor.get_attribute('contenteditable') == 'true', 'Selected independent arrow has no label editor'
                label_editor.fill('Moving label')
                label_editor.press('Enter')
                assert page.evaluate("miroBrowser.runtime.getData().miroCanvas.connectors['menu-line'].label") == 'Moving label'
                assert page.locator('.miro-canvas-connector-label[data-connector-id="menu-line"]').text_content() == 'Moving label'
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  const labelAt=()=>{const r=b.root.querySelector('.miro-canvas-connector-label[data-connector-id="menu-line"]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};};
                  const label=b.root.querySelector('.miro-canvas-connector-label[data-connector-id="menu-line"]'),{x,y}=labelAt();
                  label.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:455,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:455,clientX:x+90,clientY:y}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:455,clientX:x+90,clientY:y}));
                  const c=b.runtime.getData().miroCanvas.connectors['menu-line'];
                  if(!(c.labelT>0.5))throw Error('Dragging label did not change its route position: '+JSON.stringify({labelT:c.labelT,x,y,board:s.boardPoint({x:x+90,y})}));
                  const beforeX=labelAt().x;
                  const hit=b.root.querySelector('.miro-board-connector-hit[data-connector-id="menu-line"]');
                  const body=s.viewportPoint({x:-100,y:100});
                  hit.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:456,clientX:body.x,clientY:body.y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:456,clientX:body.x+40,clientY:body.y,bubbles:true}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:456,clientX:body.x+40,clientY:body.y,bubbles:true}));
                  const afterX=labelAt().x;
                  if(Math.abs(afterX-beforeX-40)>1)throw Error('Connector body moved without its label');
                  b.runtime.undo();s.refresh();
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  s.writeBoardConnectors([{id:'menu-line-2',from:{type:'free',x:-150,y:140},to:{type:'free',x:90,y:140},route:'straight',color:'#334455',width:2,startCap:'none',endCap:'arrow'}]);
                  s.connectorLayer.select(['menu-line','menu-line-2']);s.refresh();
                  const labelX=()=>b.root.querySelector('.miro-canvas-connector-label[data-connector-id="menu-line"]').getBoundingClientRect().left;
                  const before=labelX();
                  const frame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                  if(!frame)throw Error('Two selected arrows have no group frame');
                  const r=frame.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
                  frame.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:457,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:457,clientX:x+35,clientY:y+10}));
                  const during=labelX();
                  if(Math.abs(during-before-35)>1)throw Error('Arrow label lagged behind group drag');
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:457,clientX:x+35,clientY:y+10}));
                  const after=labelX();
                  if(Math.abs(after-before-35)>1)throw Error('Arrow label reverted after group drag');
                  b.runtime.undo();s.refresh();
                  s.writeBoardConnectors([],['menu-line-2']);
                  s.connectorLayer.select(['menu-line']);s.refresh();
                }""")
                page.evaluate("miroBrowser.runtime.menu.menuEl.replaceChildren()")
                # Delete lives under the toolbar's More menu, as in Miro.
                toolbar.get_by_role('button', name='More', exact=True).click()
                assert toolbar.get_by_role('button', name='Delete selection', exact=True).is_visible(), 'Native menu hid connector actions'
                toolbar.get_by_role('button', name='More', exact=True).click()
                assert not page.locator('.miro-board-connector-tools').is_visible()
                toolbar.get_by_role('button', name='Line color', exact=True).click()
                toolbar.get_by_label('Custom line color', exact=True).fill('#ff5500')
                assert page.evaluate("miroBrowser.runtime.getData().miroCanvas.connectors['menu-line'].color") == '#ff5500'
                toolbar.get_by_role('button', name='Line color', exact=True).click()
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,r=b.runtime;
                  if(!Object.hasOwn(r,'history')||!Object.hasOwn(r.history,'data')
                    ||!Object.hasOwn(r.history,'current')||r.history.max!==100)
                    throw Error('Synthetic host has no inspected native history object');
                  if(!Object.hasOwn(r.requestPushHistory,'run')||!Object.hasOwn(r.requestPushHistory,'cancel'))
                    throw Error('Synthetic history queue is missing own run/cancel');
                  b.setHistoryDeferred(true);
                  const prior=r.getData();prior.syntheticPendingNativeStep='before-flip';r.importData(prior);
                  s.connectorLayer.select(['menu-line']);s.refresh();
                  r.requestSave(true);
                  if(!b.historyPending())throw Error('Prior native step did not remain queued');
                  b.flipBefore=r.getData();b.flipHistoryLength=b.getHistoryLength();
                  b.flipHistoryIndex=b.getHistoryIndex();b.flipSaves=b.getSaves();
                  b.flipGeometry=s.landingGeometry().geometry.edges['menu-line'];
                  const label=b.root.querySelector('.miro-canvas-connector-label[data-connector-id="menu-line"]').getBoundingClientRect();
                  b.flipLabelCenter={x:label.left+label.width/2,y:label.top+label.height/2};
                }""")
                toolbar.get_by_role('button', name='Swap line ends', exact=True).click()
                assert page.evaluate("miroBrowser.runtime.getData().miroCanvas.connectors['menu-line'].startCap") == 'arrow'
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,r=b.runtime;
                  try{
                    const after=r.getData(),c=after.miroCanvas.connectors['menu-line'],old=b.flipBefore.miroCanvas.connectors['menu-line'];
                    if(old.startCap!=='none'||old.endCap!=='arrow'||c.endCap!=='none')throw Error('Flip lost the asymmetric caps');
                    if(JSON.stringify(c.from)!==JSON.stringify(old.to)||JSON.stringify(c.to)!==JSON.stringify(old.from))
                      throw Error('Flip did not reverse the original endpoints');
                    if(c.label!==old.label||Math.abs(c.labelT-(1-old.labelT))>1e-9)throw Error('Flip lost label content/route position');
                    const geo=s.landingGeometry().geometry.edges['menu-line'];
                    if(JSON.stringify(geo.start)!==JSON.stringify(b.flipGeometry.end)||JSON.stringify(geo.end)!==JSON.stringify(b.flipGeometry.start))
                      throw Error('Flip landing geometry did not follow reversed endpoints');
                    const label=b.root.querySelector('.miro-canvas-connector-label[data-connector-id="menu-line"]').getBoundingClientRect();
                    if(Math.abs(label.left+label.width/2-b.flipLabelCenter.x)>1||Math.abs(label.top+label.height/2-b.flipLabelCenter.y)>1)
                      throw Error('Flip moved the visible label away from its original route position');
                    if(b.getSaves()!==b.flipSaves+1||b.getHistoryLength()!==b.flipHistoryLength+2
                      ||b.getHistoryIndex()!==b.flipHistoryIndex+2||b.historyPending())
                      throw Error('Flip did not separately flush the prior step and its one own history step');
                    r.undo();s.refresh();
                    if(JSON.stringify(r.getData())!==JSON.stringify(b.flipBefore))throw Error('One Flip undo lost the prior queued edit');
                    r.redo();s.refresh();
                    if(JSON.stringify(r.getData())!==JSON.stringify(after))throw Error('Flip redo lost caps/geometry/content');
                    r.undo();s.refresh();s.connectorLayer.select(['menu-line']);s.refresh();
                    const beforeFault=r.getData(),rows=r.history.data.slice(),cursor=r.history.current;
                    const originalSave=r.requestSave;let fail=true;
                    r.requestSave=function(addHistory=true){
                      Reflect.apply(originalSave,this,[addHistory]);
                      if(addHistory&&fail){fail=false;throw Error('Synthetic save failure after enqueue');}
                    };
                    try{s.flipSelectionEdges();}finally{r.requestSave=originalSave;}
                    if(JSON.stringify(r.getData())!==JSON.stringify(beforeFault)||r.history.current!==cursor
                      ||r.history.data.length!==rows.length||r.history.data.some((row,index)=>row!==rows[index])||b.historyPending())
                      throw Error('Failed Flip left changed geometry/history or a pending redo');
                    r.redo();s.refresh();
                    if(JSON.stringify(r.getData())!==JSON.stringify(after))throw Error('Failed Flip destroyed the original redo branch');
                  }finally{b.setHistoryDeferred(false);}
                  // Restore the free-end setup for the next grip test, and prove two Flips round-trip.
                  s.connectorLayer.select(['menu-line']);s.refresh();s.flipSelectionEdges();
                  const roundTrip=r.getData().miroCanvas.connectors['menu-line'],old=b.flipBefore.miroCanvas.connectors['menu-line'];
                  const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
                    ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
                  if(Math.abs(roundTrip.labelT-old.labelT)>1e-9||canonical({...roundTrip,labelT:old.labelT})!==canonical(old))
                    throw Error('Two Flips did not restore the original cap/endpoint/label geometry');
                }""")
                page.evaluate("miroBrowser.session.armTool('connector')")
                panel = page.locator('.miro-canvas-tools__connectors')
                assert panel.locator('[data-shape]').evaluate_all("els=>els.map(e=>e.dataset.shape)") == ['arrow', 'elbow', 'block', 'line', 'curve', 'polyline', 'spline']
                assert panel.locator('[data-connector-color]').count() == 8
                panel.locator('[data-connector-color="#67c6a0"]').click()
                panel.get_by_label('New connector width slider', exact=True).fill('9')
                assert page.evaluate("miroBrowser.session.connectorColor") == '#67c6a0'
                assert page.evaluate("miroBrowser.session.connectorWidth") == 9
                assert panel.bounding_box()['width'] < 620, 'Connector bar is oversized'
                connector_layout = panel.evaluate("""el => ({width:el.clientWidth,scroll:el.scrollWidth,
                  centers:[...el.children].map(child=>{const r=child.getBoundingClientRect();return r.top+r.height/2})})""")
                assert connector_layout['scroll'] <= connector_layout['width'] + 1, connector_layout
                assert max(connector_layout['centers']) - min(connector_layout['centers']) < 2, connector_layout
                tools_bar = page.locator('.miro-canvas-tools')
                connector_width = tools_bar.bounding_box()['width']
                positions = panel.locator(':scope > [data-shape]').evaluate_all("els=>els.map(e=>e.getBoundingClientRect().top)")
                assert len(positions) == 7 and max(positions) - min(positions) < 1, 'Types must be directly available in one row'
                assert panel.locator('.miro-canvas-toolbar__panel').count() == 0
                tools_bar.get_by_role('button', name='Pen P', exact=True).click()
                assert abs(tools_bar.bounding_box()['width'] - connector_width) < 1, 'Drawing/connector widths differ'
                if args.screenshots:
                    page.screenshot(path=str(args.screenshots / 'drawing-controls.png'))
                drawing_layout = tools_bar.locator('.miro-canvas-tools__drawing').evaluate("""el => ({width:el.clientWidth,scroll:el.scrollWidth,
                  centers:[...el.children].map(child=>{const r=child.getBoundingClientRect();return r.top+r.height/2})})""")
                assert drawing_layout['scroll'] <= drawing_layout['width'] + 1, drawing_layout
                assert max(drawing_layout['centers']) - min(drawing_layout['centers']) < 2, drawing_layout
                tools_bar.locator('[data-tool="shape"]').click()
                shapes = tools_bar.locator('.miro-canvas-toolbar__panel--shapes')
                assert shapes.is_visible()
                assert not panel.is_visible()
                tools_bar.locator('[data-tool="connector"]').click()
                assert not shapes.is_visible()
                assert panel.is_visible()
                tools_bar.locator('[data-tool="shape"]').click()
                assert shapes.is_visible() and not panel.is_visible()
                page.evaluate("miroBrowser.session.armTool('connector')")
                assert not shapes.is_visible() and panel.is_visible()
                panel.locator('[data-shape="block"]').click()
                assert panel.get_by_label('New connector width', exact=True).input_value() == '16'
                panel.get_by_label('New connector width slider', exact=True).fill('23')
                panel.locator('[data-shape="arrow"]').click()
                assert panel.get_by_label('New connector width', exact=True).input_value() == '9'
                panel.locator('[data-shape="block"]').click()
                assert panel.get_by_label('New connector width', exact=True).input_value() == '23'
                panel.locator('[data-shape="arrow"]').click()
                # The selected line keeps its toolbar while the tool is armed.
                assert toolbar.get_by_role('button', name='More', exact=True).is_visible()
                # Drag an existing end while the creation tool is still armed: the
                # grips are the ones native edges use.
                before_end = page.evaluate("miroBrowser.runtime.getData().miroCanvas.connectors['menu-line'].from")
                box = page.evaluate("document.querySelector('.miro-canvas-handles [data-connector-end=from]').getBoundingClientRect().toJSON()")
                assert box is not None
                gx, gy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
                page.mouse.move(gx, gy)
                page.mouse.down()
                page.mouse.move(gx + 30, gy + 40, steps=5)
                page.mouse.up()
                after_end = page.evaluate("miroBrowser.runtime.getData().miroCanvas.connectors['menu-line'].from")
                assert abs(after_end['x'] - before_end['x'] - 30) < 1, (before_end, after_end)
                assert abs(after_end['y'] - before_end['y'] - 40) < 1, (before_end, after_end)
                assert page.locator('.miro-board-connector-hit').count() == 1, 'Grip created a new connector'
                assert page.locator('.miro-canvas-handles [data-connector-end]:visible').count() == 2
                # Non-unit zoom and an offset camera must use the same endpoint origin.
                page.evaluate("miroBrowser.runtime.setViewport(60,30,1);miroBrowser.session.followViewport()")
                box = page.evaluate("document.querySelector('.miro-canvas-handles [data-connector-end=from]').getBoundingClientRect().toJSON()")
                assert box is not None
                gx, gy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
                before_zoom_end = after_end
                page.mouse.move(gx, gy)
                page.mouse.down()
                page.mouse.move(gx + 20, gy + 30, steps=5)
                page.mouse.up()
                after_zoom_end = page.evaluate("miroBrowser.runtime.getData().miroCanvas.connectors['menu-line'].from")
                assert abs(after_zoom_end['x'] - before_zoom_end['x'] - 10) < 1, (box, before_zoom_end, after_zoom_end)
                assert abs(after_zoom_end['y'] - before_zoom_end['y'] - 15) < 1, (box, before_zoom_end, after_zoom_end)
                page.evaluate("miroBrowser.runtime.setViewport(0,0,0);miroBrowser.session.followViewport()")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,path=b.root.querySelector('.miro-board-connector-hit');
                  if(!path)throw Error('Pan test has no connector');
                  const before=path.getBoundingClientRect(),origin=s.viewportPoint({x:0,y:0});
                  b.runtime.setViewport(40,25,0);s.followViewport();
                  const after=b.root.querySelector('.miro-board-connector-hit').getBoundingClientRect(),next=s.viewportPoint({x:0,y:0});
                  if(path!==b.root.querySelector('.miro-board-connector-hit'))throw Error('Pure pan rebuilt connector DOM');
                  if(Math.abs(after.left-before.left-(next.x-origin.x))>1||Math.abs(after.top-before.top-(next.y-origin.y))>1)
                    throw Error('Pure pan left the connector behind the canvas: '+JSON.stringify({before:before.toJSON(),after:after.toJSON(),canvas:b.runtime.canvasEl.style.transform}));
                  b.runtime.setViewport(0,0,0);s.followViewport();
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,original=s.settings;
                  s.resetTools();s.settings={...original,lassoBinding:'right',panBinding:'right'};
                  let pans=0;const pan=()=>pans++;b.root.addEventListener('mousedown',pan,true);
                  const p={button:2,buttons:2,pointerId:81,clientX:950,clientY:450,bubbles:true,cancelable:true};
                  b.root.dispatchEvent(new PointerEvent('pointerdown',p));
                  b.root.dispatchEvent(new MouseEvent('mousedown',p));
                  if(!s.toolGesture)throw Error('Right lasso did not start');
                  if(s.panGestureEnd||pans)throw Error('Lasso also started panning');
                  window.dispatchEvent(new PointerEvent('pointercancel',p));
                  b.root.dispatchEvent(new MouseEvent('mousedown',{...p,button:1}));
                  if(pans!==1)throw Error('Middle pan was blocked');
                  b.root.removeEventListener('mousedown',pan,true);
                  s.settings={...original,connectorAttachNodes:true,connectorAllowFree:false,connectorAttachConnectors:false};
                  const free=s.viewportPoint({x:-600,y:-400}), node=s.viewportPoint({x:100,y:180});
                  if(s.connectorLanding(free,undefined,undefined,'')!==undefined)throw Error('Default allowed free end');
                  if(s.connectorLanding(node,undefined,undefined,'')?.nodeId!=='n1')throw Error('Default rejected node');
                  const count=Object.keys(b.runtime.getData().miroCanvas.connectors).length;
                  s.createLine({route:'straight',endCap:'arrow'},[{x:-600,y:-400},{x:-500,y:-400}]);
                  if(Object.keys(b.runtime.getData().miroCanvas.connectors).length!==count)throw Error('Creation bypassed policy');
                  s.settings={...original,connectorAttachNodes:false,connectorAllowFree:false,connectorAttachConnectors:false};
                  if(s.connectorLanding(node,undefined,undefined,'')!==undefined)throw Error('Disabled node attachment accepted');
                  const c=b.runtime.getData().miroCanvas.connectors['menu-line'];
                  const edge=s.viewportPoint({x:(c.from.x+c.to.x)/2,y:(c.from.y+c.to.y)/2});
                  if(s.connectorLanding(edge,undefined,undefined,'')!==undefined)throw Error('Disabled edge attachment accepted');
                  s.settings={...s.settings,connectorAttachConnectors:true};
                  if(s.connectorLanding(edge,undefined,undefined,'')?.anchor.type!=='edge')throw Error('Enabled edge attachment rejected');
                  s.settings={...s.settings,connectorAllowFree:true};
                  if(s.connectorLanding(free,undefined,undefined,'')?.anchor.type!=='free')throw Error('Enabled free end rejected');
                  s.settings=original;s.connectorLayer.select(['menu-line']);s.armTool('connector');
                }""")
                if args.screenshots:
                    args.screenshots.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(args.screenshots / 'connector-controls.png'))
                page.evaluate("""async () => {
                  const b=miroBrowser;b.session.resetTools();const saves=b.getSaves();
                  const c=b.runtime.getData().miroCanvas.connectors['menu-line'];
                  const middle={x:(c.from.x+c.to.x)/2,y:(c.from.y+c.to.y)/2};
                  const start=b.session.viewportPoint({x:middle.x-20,y:middle.y-20}),end=b.session.viewportPoint({x:middle.x+20,y:middle.y+20});
                  b.root.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:45,clientX:start.x,clientY:start.y,bubbles:true}));
                  const s=b.session,originalRefresh=s.refresh.bind(s),originalSelect=s.connectorLayer.select.bind(s.connectorLayer);
                  let refreshes=0,selections=0;
                  s.refresh=()=>{refreshes++;return originalRefresh();};
                  s.connectorLayer.select=(...args)=>{selections++;return originalSelect(...args);};
                  for(let i=1;i<=30;i++)window.dispatchEvent(new PointerEvent('pointermove',
                    {pointerId:45,clientX:start.x+(end.x-start.x)*i/30,clientY:start.y+(end.y-start.y)*i/30,bubbles:true}));
                  if(b.root.getAttribute('data-miro-rectangle-selecting')!=='true')throw Error('Marquee active state is missing');
                  if(refreshes!==0||selections!==0)throw Error('Marquee rebuilt the plugin on pointermove: '+JSON.stringify({refreshes,selections}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:45,clientX:end.x,clientY:end.y,bubbles:true}));
                  s.refresh=originalRefresh;s.connectorLayer.select=originalSelect;
                  await Promise.resolve();b.session.readInteractionState();
                  if(b.root.hasAttribute('data-miro-rectangle-selecting'))throw Error('Marquee active state survived release');
                  if(b.session.selectedIds.includes('menu-line'))throw Error('A small marquee selected a long crossing connector');
                  if(b.getSaves()!==saves)throw Error('Selection wrote history');
                  b.session.resetTools();b.session.commentDraft={type:'free',x:200,y:180};b.session.createComment('First press drag');b.session.closeCommentThread();b.select('n1');b.root.focus();
                }""")
                # Phones and tablets: a finger on empty board is native Canvas's
                # pan, not a marquee; a tap on the tool bar ends at the board;
                # the bars stand above Obsidian's floating navigation bar and
                # step aside for the keyboard.
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  const empty=s.viewportPoint({x:900,y:900});
                  b.root.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:61,pointerType:'touch',clientX:empty.x,clientY:empty.y,bubbles:true,cancelable:true}));
                  if(b.root.hasAttribute('data-miro-rectangle-selecting'))throw Error('A finger on empty board started a marquee');
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:61,pointerType:'touch',clientX:empty.x,clientY:empty.y,bubbles:true}));
                  let reached=0;const count=()=>{reached++;};
                  b.root.parentElement.addEventListener('click',count);
                  b.root.querySelector('.miro-canvas-tools [data-tool="select"]').click();
                  b.root.parentElement.removeEventListener('click',count);
                  if(reached!==0)throw Error('A click on the tool bar travelled past the board');
                  const navbar=document.createElement('div');
                  navbar.className='mobile-navbar';
                  const board=b.root.getBoundingClientRect();
                  navbar.style.cssText=`position:fixed;left:0;right:0;top:${board.bottom-100}px;height:52px`;
                  document.body.appendChild(navbar);
                  document.body.classList.add('is-mobile');
                  s.updatePanelPositions();
                  const tools=b.root.querySelector('.miro-canvas-toolbar.miro-canvas-tools');
                  if(!b.root.style.getPropertyValue('--miro-canvas-host-foot'))throw Error('The navigation bar was not measured');
                  if(tools.getBoundingClientRect().bottom>navbar.getBoundingClientRect().top)throw Error('The tool bar sits under the navigation bar');
                  document.documentElement.style.setProperty('--keyboard-height','300px');
                  s.updatePanelPositions();
                  if(b.root.getAttribute('data-miro-canvas-keyboard')!=='open'||getComputedStyle(tools).display!=='none')throw Error('The tool bar stayed up over the keyboard');
                  document.documentElement.style.removeProperty('--keyboard-height');
                  navbar.remove();document.body.classList.remove('is-mobile');
                  s.updatePanelPositions();
                  if(b.root.style.getPropertyValue('--miro-canvas-host-foot')||b.root.hasAttribute('data-miro-canvas-keyboard'))throw Error('A computer kept the phone layout');
                }""")
                # A tablet's own styles show the native corner squares of a picked
                # card (with more weight than a plain rule), and hand a finger's
                # move on its text to the browser, which takes the pointer back:
                # neither may happen next to the plugin's frame.
                page.evaluate("""() => {
                  const b=miroBrowser;
                  const style=document.createElement('style');
                  style.textContent='.is-mobile .canvas-wrapper:not(.mod-readonly) .canvas-node-interaction-layer .canvas-node-resizer[data-resize="topright"]{display:block;width:20px;height:20px;border:2px solid red}';
                  document.head.appendChild(style);
                  document.body.classList.add('is-mobile');
                  const layer=document.createElement('div');layer.className='canvas-node-interaction-layer';b.root.appendChild(layer);
                  const grip=layer.appendChild(document.createElement('div'));grip.className='canvas-node-resizer';grip.setAttribute('data-resize','topright');
                  const shown=getComputedStyle(grip).display;
                  layer.remove();style.remove();document.body.classList.remove('is-mobile');
                  if(shown!=='none')throw Error('The mobile styles show a native corner square next to the frame: '+shown);
                }""")
                # A finger's move on a picked card's text must stay on the page, or the
                # browser takes it for a scroll and calls the pointer back.  The session
                # marks each card that is picked, not being written in and holding no
                # frame as native Canvas changes its classes; the styles read the mark
                # and carry it on a touch screen only.  A computer with a mouse does not.
                page.evaluate("""() => {
                  const b=miroBrowser;
                  const make=()=>{
                    const card=document.createElement('div');
                    const content=card.appendChild(document.createElement('div'));content.className='canvas-node-content';
                    const text=content.appendChild(document.createElement('div'));
                    // Native Canvas lays its cards on the canvas element.
                    b.runtime.canvasEl.appendChild(card);
                    return {card,content,text};
                  };
                  window.__pickedCards=[make(),make()];
                }""")
                page.evaluate("""async () => {
                  const settled=()=>new Promise(done=>setTimeout(done,0));
                  const {card,text}=window.__pickedCards[0];
                  card.className='canvas-node is-focused';
                  await settled();
                  if(!card.hasAttribute('data-miro-canvas-picked'))throw Error('A picked card was not marked');
                  if(getComputedStyle(text).touchAction==='none')throw Error('A computer with a mouse carries the touch rule');
                  card.className='canvas-node';
                  await settled();
                }""")
                page.evaluate("""() => {
                  window.__plusTouch=[];
                  for(const type of ['pointerdown','pointerup','pointercancel']) document.addEventListener(type,e=>window.__plusTouch.push({type,x:e.clientX,y:e.clientY,item:e.target.closest?.('[data-tool]')?.getAttribute('data-tool'),tag:e.target.className}),true);
                }""")
                touch = page.context.new_cdp_session(page)
                touch.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
                try:
                    page.evaluate("""async () => {
                      const settled=()=>new Promise(done=>setTimeout(done,0));
                      const [{card,content,text},second]=window.__pickedCards;
                      const marked=(element)=>element.hasAttribute('data-miro-canvas-picked');
                      const touchAction=async(classes)=>{card.className=classes;await settled();return getComputedStyle(text).touchAction;};
                      for(const classes of ['canvas-node is-focused','canvas-node is-selected']){
                        if(await touchAction(classes)!=='none'||!marked(card))throw Error('A picked card lets the browser scroll under a finger: '+classes);
                      }
                      for(const classes of ['canvas-node','canvas-node is-focused is-editing']){
                        if(await touchAction(classes)==='none'||marked(card))throw Error('A card not picked, or being written in, cannot scroll its text: '+classes);
                      }
                      // One of several picked cards is let go: only the others keep the mark.
                      card.className='canvas-node is-selected';
                      second.card.className='canvas-node is-selected';
                      await settled();
                      if(!marked(card)||!marked(second.card)||getComputedStyle(second.text).touchAction!=='none')throw Error('A selection of several cards was not all marked');
                      card.className='canvas-node';
                      await settled();
                      if(marked(card)||!marked(second.card))throw Error('Letting one card go changed the marks of the others');
                      second.card.className='canvas-node';
                      await settled();
                      // A card that shows a web page keeps its own touch handling: no mark, and its page stays scrollable.
                      const frame=content.appendChild(document.createElement('iframe'));
                      card.className='canvas-node is-focused';
                      await settled();
                      if(marked(card)||getComputedStyle(text).touchAction==='none'||getComputedStyle(frame).touchAction==='none'||getComputedStyle(content).touchAction==='none')
                        throw Error('A picked card that shows a web page cannot scroll it');
                      frame.remove();
                      card.className='canvas-node is-selected';
                      await settled();
                      if(!marked(card)||getComputedStyle(text).touchAction!=='none')throw Error('A picked card is not marked once its frame is gone');
                    }""")
                finally:
                    touch.send("Emulation.setTouchEmulationEnabled", {"enabled": False})
                page.evaluate("""() => {
                  for(const {card} of window.__pickedCards)card.remove();
                  delete window.__pickedCards;
                }""")
                # A bar turned vertical holds one control to a row wherever a control
                # sits - native Canvas's own buttons too, which the tablet's Obsidian
                # offers more than one of in a slot - and opens the pen's settings and
                # the lines' settings as a second column of the bar: as wide as the bar,
                # beside it towards the middle of the board, its top level with the
                # bar's, one control to a row in the order of the horizontal row (tools,
                # colours, then the width: its sample, the slider upright and the
                # number), the colours as small as there, wholly in view, and scrolling
                # inside itself when the room is short.
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  const tools=b.root.querySelector('.miro-canvas-toolbar.miro-canvas-tools');
                  const dock=b.root.querySelector('.miro-canvas-dock');
                  const original=s.settings;
                  // The page has no Obsidian theme, so the rules between sections have no colour to be drawn in yet.
                  document.documentElement.style.setProperty('--background-modifier-border','#888');
                  const placeBars=(anchor,dy,dockAnchor)=>{
                    s.settings={...original,panelLayout:{...original.panelLayout,toolbar:{anchor,dx:0,dy,orientation:'vertical'},dockBar:{anchor:dockAnchor,dx:0,dy:0,orientation:'vertical'}}};
                    s.updatePanelPositions();
                  };
                  const inside=(inner,outer)=>inner.left>=outer.left-0.5&&inner.right<=outer.right+0.5&&inner.top>=outer.top-0.5&&inner.bottom<=outer.bottom+0.5;
                  const seen=(element)=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0;};
                  const nameOf=(control)=>control.getAttribute('data-tool')||control.getAttribute('data-shape')||control.getAttribute('data-native')||control.getAttribute('aria-label')||String(control.className);
                  // Every visible control under `scope`, top to bottom: none shares a row with the one above it.
                  const aloneInItsRow=(scope,selector,what)=>{
                    const boxes=[...scope.querySelectorAll(selector)].filter((control)=>seen(control)&&!control.closest('.miro-canvas-toolbar__panel')&&!control.closest('.miro-canvas-dock__menu'))
                      .map((control)=>({name:nameOf(control),at:control.getBoundingClientRect()})).sort((a,c)=>a.at.top-c.at.top);
                    if(boxes.length<4)throw Error('Too few controls to check in '+what+': '+boxes.length);
                    for(let i=1;i<boxes.length;i++)
                      if(boxes[i].at.top<boxes[i-1].at.bottom-0.5)throw Error('Two controls share a row in '+what+': '+boxes[i-1].name+' and '+boxes[i].name);
                    return boxes;
                  };
                  const barItems=(bar)=>bar.querySelector(':scope > .miro-canvas-toolbar__bar:not(.miro-canvas-tools__drawing):not(.miro-canvas-tools__connectors)');
                  const settingsOf=(button)=>[...tools.querySelectorAll(button)].find(seen);
                  // The colours as small as they are in the horizontal row.
                  s.armTool('pen');
                  const swatchSize=tools.querySelector('.miro-canvas-tools__drawing .miro-canvas-toolbar__button--swatch').getBoundingClientRect().width;
                  s.armTool('select');
                  for(const [anchor,dy,dockAnchor] of [['left-middle',0,'right-middle'],['left-middle',380,'right-middle'],['left-middle',-380,'right-middle'],['right-middle',0,'left-middle'],['right-middle',380,'left-middle']]){
                    placeBars(anchor,dy,dockAnchor);
                    if(tools.getAttribute('data-miro-canvas-panel-orientation')!=='vertical')throw Error('The bar did not turn vertical at '+anchor);
                    if(dock.getAttribute('data-miro-canvas-panel-orientation')!=='vertical')throw Error('The dock did not turn vertical at '+dockAnchor);
                    const side=tools.getAttribute('data-miro-canvas-panel-side');
                    aloneInItsRow(barItems(tools),'button,.canvas-card-menu-button','the bar at '+anchor);
                    aloneInItsRow(dock.querySelector('.miro-canvas-dock__bar'),'button','the dock at '+dockAnchor);
                    const native=[...barItems(tools).querySelectorAll('.miro-canvas-toolbar__native-slot .canvas-card-menu-button')].filter(seen);
                    if(native.length<5)throw Error('Native Canvas buttons are not in the bar: '+native.length);
                    const more=getComputedStyle(tools.querySelector('.miro-canvas-tools__more'));
                    if(more.borderLeftWidth!=='0px'||more.borderTopWidth==='0px')throw Error('The rule before More does not lie across a vertical bar');
                    for(const [button,rowClass] of [['[data-tool-group="drawing"]','miro-canvas-tools__drawing'],['[data-tool="connector"]','miro-canvas-tools__connectors']]){
                      settingsOf(button).click();
                      const row=tools.querySelector('.'+rowClass);
                      const at=row.getBoundingClientRect(),bar=tools.getBoundingClientRect(),board=b.root.getBoundingClientRect();
                      const where=JSON.stringify({anchor,dy,rowClass,at,bar});
                      if(row.hidden||getComputedStyle(row).flexDirection!=='column')throw Error('The settings are not laid out as one column: '+where);
                      if(Math.abs(at.width-bar.width)>1.5)throw Error('The settings are not as wide as the bar: '+where);
                      const gap=side==='left'?at.left-bar.right:bar.left-at.right;
                      if(gap<2||gap>8)throw Error('The settings are not beside the bar, towards the middle, with the gap of the bar itself: '+gap+' '+where);
                      if(Math.abs(at.top-bar.top)>1.5)throw Error('The settings are not level with the top of the bar: '+where);
                      if(at.top<board.top-0.5||at.bottom>board.bottom+0.5||at.left<board.left-0.5||at.right>board.right+0.5)throw Error('The settings run off the board: '+where);
                      const controls=aloneInItsRow(row,'button,input,.miro-canvas-tools__preview','the settings '+rowClass);
                      if(controls.some((control)=>control.at.left<at.left-0.5||control.at.right>at.right+0.5))throw Error('A control runs out of its column: '+where);
                      // The order of the horizontal row: the tools, the colours, then the width - its sample, the slider and the number.
                      const top=(selector)=>row.querySelector(selector).getBoundingClientRect().top;
                      const order=[':scope > button',':scope > .miro-canvas-tools__swatches',':scope > .miro-canvas-tools__size .miro-canvas-tools__preview',':scope > .miro-canvas-tools__size .miro-canvas-toolbar__range',':scope > .miro-canvas-tools__size .miro-canvas-tools__number'].map(top);
                      if(order.some((value,index)=>index&&value<=order[index-1]))throw Error('The settings are not in the order tools, colours, width: '+order+' '+where);
                      const swatch=row.querySelector('.miro-canvas-toolbar__button--swatch').getBoundingClientRect();
                      if(Math.abs(swatch.width-swatchSize)>0.5||Math.abs(swatch.height-swatchSize)>0.5)throw Error('The colours are not as small as in the horizontal row: '+swatch.width+' against '+swatchSize);
                      const slider=row.querySelector('.miro-canvas-toolbar__range'),sliderBox=slider.getBoundingClientRect();
                      if(!getComputedStyle(slider).writingMode.startsWith('vertical')||sliderBox.height<=sliderBox.width)throw Error('The slider does not stand upright: '+where);
                      for(const section of [':scope > .miro-canvas-tools__swatches',':scope > .miro-canvas-tools__size']){
                        const rule=getComputedStyle(row.querySelector(section));
                        if(rule.borderTopWidth!=='1px'||rule.borderLeftWidth!=='0px')throw Error('The rule between the settings does not lie across the column: '+section);
                      }
                    }
                  }
                  // A short view: the column keeps every control its size and its top level with the bar's, and scrolls inside itself, wholly in view.
                  placeBars('left-middle',0,'right-middle');
                  s.armTool('select');
                  settingsOf('[data-tool="connector"]').click();
                  const row=tools.querySelector('.miro-canvas-tools__connectors');
                  const sizes=()=>[...row.querySelectorAll('button,input')].filter(seen).map((control)=>Math.round(control.getBoundingClientRect().height));
                  const before=JSON.stringify(sizes());
                  const height=b.root.style.height;
                  const room=()=>b.root.getBoundingClientRect().bottom-8-tools.getBoundingClientRect().top;
                  const limit=()=>parseFloat(row.style.getPropertyValue('--miro-canvas-side-row-max-height'));
                  b.root.style.height='420px';
                  s.updatePanelPositions();
                  const short=row.getBoundingClientRect(),board=b.root.getBoundingClientRect(),barBox=tools.getBoundingClientRect();
                  if(!(row.scrollHeight>row.clientHeight+1)||getComputedStyle(row).overflowY==='visible')throw Error('A column taller than the room does not scroll: '+JSON.stringify({scroll:row.scrollHeight,client:row.clientHeight}));
                  if(Math.abs(short.top-barBox.top)>1.5)throw Error('A column taller than the room is not level with the bar: '+JSON.stringify({short,barBox}));
                  if(short.bottom>board.bottom-7.5)throw Error('A column taller than the room leaves the view: '+JSON.stringify({short,board}));
                  if(Math.abs(limit()-room())>1)throw Error('A column is not held to the room from the bar to the foot of the view: '+limit()+' against '+room());
                  if(JSON.stringify(sizes())!==before)throw Error('A column taller than the room squeezes its controls: '+before+' against '+JSON.stringify(sizes()));
                  b.root.style.height=height;
                  s.updatePanelPositions();
                  if(Math.abs(limit()-room())>1)throw Error('A column kept the room of a short view after the room came back: '+limit()+' against '+room());
                  // A bar high in the view leaves the column room to show everything, and it does not scroll.
                  placeBars('left-middle',-380,'right-middle');
                  if(row.scrollHeight>row.clientHeight+1)throw Error('A column with room to spare still scrolls: '+JSON.stringify({scroll:row.scrollHeight,client:row.clientHeight}));
                  // Every item a person can put on the bar, all of them on it, stands alone in its row.
                  const full=b.mountFullBar();
                  const items=aloneInItsRow(barItems(full.element),'button,.canvas-card-menu-button','the bar holding every item');
                  if(items.length<18)throw Error('The bar holding every item shows only '+items.length+' controls');
                  for(const item of ['select','lasso','text','sticky','shape','pen','connector','comment','frame','code','table','link']){
                    const found=item==='pen'?full.itemsRow.querySelector('[data-tool-group="drawing"]'):full.itemsRow.querySelector('[data-tool="'+item+'"]');
                    if(!found||!seen(found))throw Error('The item '+item+' is not on the bar holding every item');
                  }
                  for(const item of ['card','note','media'])
                    if(![...full.itemsRow.querySelectorAll('[data-native="'+item+'"] .canvas-card-menu-button')].some(seen))throw Error('The native item '+item+' is not on the bar holding every item');
                  full.dispose();
                  s.settings=original;s.updatePanelPositions();
                  const drawing=tools.querySelector('.miro-canvas-tools__drawing');
                  if(drawing.style.getPropertyValue('--miro-canvas-side-row-max-height')!==''||getComputedStyle(drawing).flexDirection!=='row')throw Error('A horizontal bar kept the height of a vertical one');
                  const slot=getComputedStyle(tools.querySelector('.miro-canvas-toolbar__native-slot'));
                  if(slot.flexDirection!=='row')throw Error('A horizontal bar stacks its native slots');
                  document.documentElement.style.removeProperty('--background-modifier-border');
                  b.root.querySelector('.miro-canvas-tools [data-tool="select"]').click();
                }""")
                # The armed tool is marked the way Select is, on every tool of the bars: the
                # tools on the bar, those under More, the pen's kinds and the lines' kinds in
                # the settings.  Both orientations; with a pointer resting on the armed tool
                # or not; and on a screen that cannot hover, where a finger or a pen leaves
                # its last touch "hovered" until the next one - that must neither grey the
                # armed tool nor light an idle one.
                page.evaluate("""() => {
                  const theme={'--interactive-accent':'#8a5cf5','--background-modifier-active-hover':'rgba(138,92,245,0.1)','--background-modifier-hover':'rgba(255,255,255,0.15)','--icon-color':'#b3b3b3','--icon-color-hover':'#dadada','--text-normal':'#dadada','--text-muted':'#b3b3b3'};
                  for(const [name,value] of Object.entries(theme))document.documentElement.style.setProperty(name,value);
                  miroBrowser.originalSettings=miroBrowser.session.settings;
                }""")
                cdp = page.context.new_cdp_session(page)
                cdp.send('DOM.enable')
                cdp.send('CSS.enable')
                accent, idle = 'rgb(138, 92, 245)', 'rgba(0, 0, 0, 0)'

                def turn_bar(orientation):
                    page.evaluate("""(orientation) => {
                      const s=miroBrowser.session,original=miroBrowser.originalSettings;
                      s.settings=orientation==='vertical'
                        ?{...original,panelLayout:{...original.panelLayout,toolbar:{anchor:'left-middle',dx:0,dy:0,orientation:'vertical'},dockBar:{anchor:'right-middle',dx:0,dy:0,orientation:'vertical'}}}
                        :original;
                      s.updatePanelPositions();
                    }""", orientation)

                def look(selector, hover=False, forced=False):
                    # `hover`: the mouse rests on the control.  `forced`: the browser takes the control
                    # for hovered whatever the mouse does, as a touch screen does after a touch.
                    control = page.locator('.miro-canvas-tools ' + selector + ':visible').first
                    if hover:
                        control.hover()
                    else:
                        page.mouse.move(2, 2)
                    found = None
                    if forced:
                        control.evaluate("el => el.setAttribute('data-smoke-hover', '')")
                        document = cdp.send('DOM.getDocument', {'depth': 0})
                        found = cdp.send('DOM.querySelector', {'nodeId': document['root']['nodeId'], 'selector': '[data-smoke-hover]'})
                        cdp.send('CSS.forcePseudoState', {'nodeId': found['nodeId'], 'forcedPseudoClasses': ['hover']})
                    style = control.evaluate("el => { const style = getComputedStyle(el); return { color: style.color, background: style.backgroundColor }; }")
                    if found is not None:
                        cdp.send('CSS.forcePseudoState', {'nodeId': found['nodeId'], 'forcedPseudoClasses': []})
                        control.evaluate("el => el.removeAttribute('data-smoke-hover')")
                    return style

                def arm(tool):
                    page.evaluate("tool => miroBrowser.session.armTool(tool)", tool)

                def more_menu(open_it):
                    shown = page.locator('.miro-canvas-tools__more .miro-canvas-toolbar__panel').is_visible()
                    if shown != open_it:
                        page.locator('.miro-canvas-tools__more > button').click()

                on_bar = [(tool, f'[data-tool="{tool}"]') for tool in ('select', 'lasso', 'text', 'sticky', 'shape', 'connector', 'comment', 'frame')]
                on_bar.append(('pen', '[data-tool-group="drawing"]'))
                in_settings = [(tool, f'.miro-canvas-tools__drawing [data-tool="{tool}"]') for tool in ('pen', 'highlighter', 'smart', 'eraser', 'erase-part')]
                under_more = [(tool, f'[data-tool="{tool}"]') for tool in ('code', 'table', 'link')]
                line_kinds = ['arrow', 'elbow', 'block', 'line', 'curve', 'polyline', 'spline']
                looks = 0
                for orientation in ('horizontal', 'vertical'):
                    turn_bar(orientation)
                    arm('select')
                    select_look = look('[data-tool="select"]')
                    assert select_look['color'] == accent and select_look['background'] != idle, (orientation, select_look)
                    for mode in ('at rest', 'hovered', 'cannot hover'):
                        resting_on = {'at rest': {}, 'hovered': {'hover': True}, 'cannot hover': {'forced': True}}[mode]
                        if mode == 'cannot hover':
                            # A touch screen: no hovering pointer, and a coarse one.
                            cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                            assert page.evaluate("matchMedia('(hover: hover)').matches") is False
                            page.evaluate("miroBrowser.session.updatePanelPositions()")
                            arm('select')
                            select_look = look('[data-tool="select"]')
                        for tool, selector in on_bar + in_settings + under_more:
                            arm(tool)
                            if (tool, selector) in under_more:
                                more_menu(True)
                            armed_look = look(selector, **resting_on)
                            assert armed_look == select_look, f'{tool} armed does not look like Select ({orientation}, {mode}): {armed_look} against {select_look}'
                            looks += 1
                            if (tool, selector) in under_more:
                                more_menu(False)
                        # The tool that is not armed stays plain - and, where a pointer can hover, lights up under it.
                        arm('text')
                        idle_look = look('[data-tool="lasso"]')
                        assert idle_look['color'] != accent and idle_look['background'] == idle, (orientation, mode, idle_look)
                        resting = look('[data-tool="lasso"]', **resting_on)
                        if mode == 'cannot hover':
                            assert resting == idle_look, f'A tool a pen or a finger rests on looks lit on a screen that cannot hover: {resting}'
                        elif mode == 'hovered' and page.evaluate("matchMedia('(hover: hover)').matches"):
                            # A headless browser on Linux says it cannot hover, so the hover look is checked only where it can.
                            assert resting['background'] != idle and resting['color'] != accent, resting
                        # The lines' kinds, each armed in turn with the pointer still on it.
                        arm('connector')
                        for kind in line_kinds:
                            page.locator(f'.miro-canvas-tools__connectors [data-shape="{kind}"]').click()
                            chosen = look(f'.miro-canvas-tools__connectors [data-shape="{kind}"]', **resting_on)
                            assert chosen == select_look, f'The line kind {kind} chosen does not look like Select ({orientation}, {mode}): {chosen}'
                            looks += 1
                        other = look('.miro-canvas-tools__connectors [data-shape="arrow"]')
                        assert other['background'] == idle, f'A line kind not chosen looks lit ({orientation}, {mode}): {other}'
                        if mode == 'cannot hover':
                            cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': False})
                            page.evaluate("miroBrowser.session.updatePanelPositions()")
                assert looks == 2 * 3 * (len(on_bar + in_settings + under_more) + len(line_kinds)), looks
                turn_bar('horizontal')
                arm('select')
                page.mouse.move(2, 2)
                page.evaluate("""() => {
                  for(const name of ['--interactive-accent','--background-modifier-active-hover','--background-modifier-hover','--icon-color','--icon-color-hover','--text-normal','--text-muted'])
                    document.documentElement.style.removeProperty(name);
                }""")
                # A repeat press on the armed tool folds its settings away and leaves the tool
                # armed; one more shows them; another tool, then this one again, opens them.
                # The pen's kinds share the pen's button, the lines have their own, and the
                # shape tool's settings are the picker under its button.  Both orientations.
                drawing_layer = '.miro-canvas-tools__drawing'
                folding = [
                    ('pen', '[data-tool-group="drawing"]', drawing_layer, False),
                    ('highlighter', '[data-tool-group="drawing"]', drawing_layer, True),
                    ('smart', '[data-tool-group="drawing"]', drawing_layer, True),
                    ('eraser', '[data-tool-group="drawing"]', drawing_layer, True),
                    ('erase-part', '[data-tool-group="drawing"]', drawing_layer, True),
                    ('connector', '[data-tool="connector"]', '.miro-canvas-tools__connectors', False),
                    ('shape', '[data-tool="shape"]', '.miro-canvas-toolbar__panel--shapes', False),
                ]
                armed_tool = lambda: page.evaluate("miroBrowser.root.getAttribute('data-miro-canvas-tool')")
                folds = 0
                for orientation in ('horizontal', 'vertical'):
                    turn_bar(orientation)
                    for tool, button, layer, armed_by_key in folding:
                        shown = page.locator('.miro-canvas-tools ' + layer)
                        press = page.locator('.miro-canvas-tools ' + button).first
                        # The pen's button arms the kind of drawing used last.
                        arm(tool)
                        arm('select')
                        assert not shown.is_visible(), (orientation, tool)
                        if armed_by_key:
                            arm(tool)
                        else:
                            press.click()
                        assert armed_tool() == tool and shown.is_visible(), f'{tool} did not open its settings ({orientation})'
                        press.click()
                        assert not shown.is_visible() and armed_tool() == tool, f'A repeat press on {tool} did not fold its settings ({orientation})'
                        press.click()
                        assert shown.is_visible() and armed_tool() == tool, f'One more press on {tool} did not show its settings ({orientation})'
                        press.click()
                        assert not shown.is_visible() and armed_tool() == tool, (orientation, tool)
                        arm('text')
                        assert not shown.is_visible()
                        if armed_by_key:
                            arm(tool)
                        else:
                            press.click()
                        assert armed_tool() == tool and shown.is_visible(), f'{tool} picked again after another did not open its settings ({orientation})'
                        folds += 1
                assert folds == 2 * len(folding), folds
                turn_bar('horizontal')
                arm('select')
                # The same second column on a touch screen, whose bar has finger-sized buttons:
                # still as wide as the bar, every control inside it and in a row of its own.
                cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
                # (The page has no Obsidian theme: the boxes have no border colour to be drawn in yet.)
                page.evaluate("document.documentElement.style.setProperty('--background-modifier-border', '#888')")
                turn_bar('vertical')
                for tool in ('pen', 'connector'):
                    arm(tool)
                    found = page.evaluate("""(tool) => {
                      const tools=document.querySelector('.miro-canvas-toolbar.miro-canvas-tools');
                      const row=tools.querySelector(tool==='pen'?'.miro-canvas-tools__drawing':'.miro-canvas-tools__connectors');
                      const bar=tools.getBoundingClientRect(),at=row.getBoundingClientRect();
                      const boxes=[...row.querySelectorAll('button,input,.miro-canvas-tools__preview')].map((control)=>control.getBoundingClientRect()).filter((box)=>box.width>0).sort((a,c)=>a.top-c.top);
                      return {bar:bar.width,column:at.width,size:getComputedStyle(tools).getPropertyValue('--miro-canvas-toolbar-size').trim(),
                        outside:boxes.filter((box)=>box.left<at.left-0.5||box.right>at.right+0.5).length,
                        sharing:boxes.filter((box,index)=>index&&box.top<boxes[index-1].bottom-0.5).length};
                    }""", tool)
                    assert found['size'] == '40px' and abs(found['column'] - found['bar']) < 1.5, found
                    assert found['outside'] == 0 and found['sharing'] == 0, found
                cdp.send('Emulation.setTouchEmulationEnabled', {'enabled': False})
                page.evaluate("document.documentElement.style.removeProperty('--background-modifier-border')")
                turn_bar('horizontal')
                arm('select')
                # A stylus hovering over a control of the board, on a phone or a tablet, shows the
                # control's label as a tooltip in Obsidian's own classes, after the delay the
                # control asks for, above or beside it and in view; it goes when the pen leaves,
                # touches the screen or goes out of range.  A finger never shows one, nor does
                # the mouse a browser makes of a pen it is driven with; on a computer no tooltip
                # comes from here at all.  Real pen pointers, through the browser's own input.
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  s.resetTools();
                  s.commentDraft={type:'free',x:240,y:200};s.createComment('Pen tooltip');s.closeCommentThread();
                  b.select('n1');
                  s.armTool('pen');
                }""")
                viewport = page.viewport_size
                pen_at = lambda x, y, **extra: cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y, 'pointerType': 'pen', 'buttons': 0, **extra})
                tip = page.locator('.tooltip.miro-canvas-pen-tooltip')

                def hover_with_pen(selector, leave=True):
                    control = page.locator(selector + ':visible').first
                    box = control.bounding_box()
                    assert box is not None, selector
                    pen_at(2, 2)
                    page.wait_for_timeout(50)
                    pen_at(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                    delay = int(control.get_attribute('data-tooltip-delay') or 1000)
                    page.wait_for_timeout(max(delay - 100, 0))
                    before = tip.count()
                    page.wait_for_timeout(250)
                    found = {'before': before, 'count': tip.count(), 'control': box}
                    if found['count'] == 1:
                        shown = tip.first
                        found.update({'text': shown.text_content(), 'box': shown.bounding_box(), 'class': shown.get_attribute('class'),
                                      'label': control.get_attribute('aria-label')})
                    if leave:
                        pen_at(2, 2)
                        page.wait_for_timeout(50)
                        found['after'] = tip.count()
                    return found

                page.evaluate("document.body.classList.add('is-mobile')")
                page.wait_for_timeout(100)
                labelled = [
                    ('the tool bar', '.miro-canvas-tools__more > button'),
                    ('the pen settings', '.miro-canvas-tools__drawing [data-tool="highlighter"]'),
                    ('the bar next to the pen', '.miro-canvas-tools [data-tool="text"]'),
                    ('the dock', '.miro-canvas-dock button[aria-label]'),
                    ('the selection toolbar', '[data-miro-canvas-toolbar] button[aria-label]'),
                ]
                for where, selector in labelled:
                    found = hover_with_pen(selector)
                    assert found['before'] == 0 and found['count'] == 1, f'No tooltip, or too early, for a pen over {where}: {found}'
                    assert found['text'] == found['label'], (where, found)
                    shown, control = found['box'], found['control']
                    assert shown['x'] >= 0 and shown['y'] >= 0 and shown['x'] + shown['width'] <= viewport['width'] and shown['y'] + shown['height'] <= viewport['height'], (where, found)
                    # Beside the control, not over it.
                    assert shown['y'] + shown['height'] <= control['y'] + 1 or shown['y'] >= control['y'] + control['height'] - 1 \
                        or shown['x'] + shown['width'] <= control['x'] + 1 or shown['x'] >= control['x'] + control['width'] - 1, (where, found)
                    assert found['after'] == 0, f'The tooltip stayed when the pen left {where}: {found}'
                # A comment thread's buttons too: a tool armed puts an open thread away, so with select armed.
                arm('select')
                page.evaluate("miroBrowser.root.querySelector('.miro-canvas-comment-marker')?.click()")
                found = hover_with_pen('.miro-canvas-thread button[aria-label]')
                assert found['before'] == 0 and found['count'] == 1 and found['text'] == found['label'] and found['after'] == 0, f'A pen over a comment thread: {found}'
                page.evaluate("miroBrowser.session.closeCommentThread()")
                # The bar's own pen button asks for its tooltip above it, in Obsidian's top class.
                found = hover_with_pen('.miro-canvas-tools [data-tool="text"]')
                assert 'mod-top' in found['class'] and found['box']['y'] + found['box']['height'] <= found['control']['y'], found
                # It goes when the pen touches the screen, and is not shown again while it presses.
                pen_at(2, 2)
                control = page.locator('.miro-canvas-tools [data-tool="text"]:visible').first
                box = control.bounding_box()
                pen_at(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                page.wait_for_timeout(450)
                assert tip.count() == 1
                cdp.send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2,
                                                      'button': 'left', 'buttons': 1, 'clickCount': 1, 'pointerType': 'pen', 'force': 0.3})
                assert tip.count() == 0, 'The tooltip stayed when the pen touched the screen'
                cdp.send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2,
                                                      'button': 'left', 'buttons': 0, 'clickCount': 1, 'pointerType': 'pen'})
                arm('select')
                # A finger, and a mouse, never show one.
                for pointer_type in ('touch', 'mouse'):
                    page.evaluate("""(pointerType) => {
                      const control=document.querySelector('.miro-canvas-tools [data-tool="sticky"]');
                      control.dispatchEvent(new PointerEvent('pointerover',{pointerType,pointerId:31,bubbles:true}));
                    }""", pointer_type)
                    page.wait_for_timeout(450)
                    assert tip.count() == 0, f'A {pointer_type} was given a tooltip'
                    page.evaluate("""(pointerType) => document.querySelector('.miro-canvas-tools [data-tool="sticky"]').dispatchEvent(new PointerEvent('pointerout',{pointerType,pointerId:31,bubbles:true}))""", pointer_type)
                # On a computer, a pen gets nothing from here: Obsidian's own tooltips serve the mouse.
                page.evaluate("document.body.classList.remove('is-mobile')")
                found = hover_with_pen('.miro-canvas-tools [data-tool="text"]')
                assert found['count'] == 0, f'A computer was given the stylus tooltip: {found}'
                pen_at(2, 2)
                page.evaluate("""() => {
                  const s=miroBrowser.session;s.resetTools();s.closeCommentThread();miroBrowser.select('n1');
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,c=b.runtime.getData().miroCanvas.connectors['menu-line'];
                  const at=s.viewportPoint(c.from),first={x:at.x-12,y:at.y-12},last={x:at.x+12,y:at.y+12};
                  b.root.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:245,clientX:first.x,clientY:first.y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:245,clientX:last.x,clientY:last.y}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:245,clientX:last.x,clientY:last.y}));
                  const mask=s.selectedRouteEnds.get('menu-line');
                  if(!mask?.from||mask.to||!s.selectedIds.includes('menu-line'))throw Error('Marquee did not select only the near endpoint');
                  const frame=b.root.querySelector('.miro-canvas-mixed-selection-frame'),r=frame?.getBoundingClientRect();
                  if(!r||r.width>60||r.height>60)throw Error('Partial connector selection framed the far end');
                  const before=b.runtime.getData(),x=r.left+r.width/2,y=r.top+r.height/2;
                  frame.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:247,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:247,clientX:x+30,clientY:y+15}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:247,clientX:x+30,clientY:y+15}));
                  const after=b.runtime.getData();
                  if(after.miroCanvas.connectors['menu-line'].from.x!==before.miroCanvas.connectors['menu-line'].from.x+30
                    ||after.miroCanvas.connectors['menu-line'].to.x!==before.miroCanvas.connectors['menu-line'].to.x)
                    throw Error('Partial selection moved the far endpoint');
                  const second=b.root.querySelector('.miro-canvas-mixed-selection-frame')?.getBoundingClientRect();
                  if(!second||!s.selectedRouteEnds.get('menu-line')?.from)throw Error('Partial endpoint selection vanished after first move');
                  const sx=second.left+second.width/2,sy=second.top+second.height/2;
                  b.root.querySelector('.miro-canvas-mixed-selection-frame').dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:250,clientX:sx,clientY:sy,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:250,clientX:sx+10,clientY:sy+5}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:250,clientX:sx+10,clientY:sy+5}));
                  const twice=b.runtime.getData().miroCanvas.connectors['menu-line'];
                  if(twice.from.x!==before.miroCanvas.connectors['menu-line'].from.x+40||twice.to.x!==before.miroCanvas.connectors['menu-line'].to.x)
                    throw Error('Second partial drag moved the far endpoint');
                  b.runtime.undo();b.runtime.undo();s.resetTools();
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,route=s.landingGeometry().geometry.edges.e1;
                  const at=s.viewportPoint(route.start),first={x:at.x-10,y:at.y-10},last={x:at.x+10,y:at.y+10};
                  b.root.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:248,clientX:first.x,clientY:first.y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:248,clientX:last.x,clientY:last.y}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:248,clientX:last.x,clientY:last.y}));
                  const mask=s.selectedRouteEnds.get('e1');
                  if(!mask?.from||mask.to)throw Error('Native edge near end was not selected separately');
                  const frame=b.root.querySelector('.miro-canvas-mixed-selection-frame'),r=frame?.getBoundingClientRect();
                  if(!r||r.width>60||r.height>60)throw Error('Native partial edge frame includes its far end');
                  const before=b.runtime.getData(),x=r.left+r.width/2,y=r.top+r.height/2;
                  frame.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:249,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:249,clientX:x+25,clientY:y+15}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:249,clientX:x+25,clientY:y+15}));
                  const after=b.runtime.getData(),anchor=after.miroCanvas.localOverrides.e1?.connectorAnchors?.from;
                  if(anchor?.type!=='free'||Math.abs(anchor.x-route.start.x-25)>1||Math.abs(anchor.y-route.start.y-15)>1
                    ||after.miroCanvas.localOverrides.e1?.connectorAnchors?.to!==undefined)
                    throw Error('Native partial edge moved or detached the wrong end: '+JSON.stringify(anchor));
                  b.runtime.undo();s.resetTools();
                  if(JSON.stringify(b.runtime.getData())!==JSON.stringify(before))throw Error('Native endpoint drag undo failed');
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;s.resetTools();
                  // The synthetic host places native DOM nodes directly in the root,
                  // while plugin routes use the centered Canvas viewport transform.
                  // The marquee deliberately spans both painted coordinate systems.
                  const start={x:10,y:20},end=s.viewportPoint({x:400,y:330});
                  const nativeBox=b.root.appendChild(document.createElement('div'));nativeBox.className='canvas-selection';
                  b.root.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:246,clientX:start.x,clientY:start.y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:246,clientX:end.x,clientY:end.y,bubbles:true}));
                  const marquee=b.root.querySelector('.miro-canvas-rectangle-marquee');
                  if(!marquee||marquee.hidden||getComputedStyle(nativeBox).visibility!=='hidden')throw Error('Two live rectangle frames are visible');
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:246,clientX:end.x,clientY:end.y,bubbles:true}));
                  if(b.root.querySelector('.miro-canvas-rectangle-marquee'))throw Error('Live marquee survived release');
                  if(!s.selectedIds.includes('n1')||!s.selectedIds.includes('menu-line')||!s.selectedIds.includes('e1'))
                    throw Error('Rectangle failed to select node, independent connector, or native edge: '+s.selectedIds);
                  const comment=s.commentThreads()[0],key=comment.origin+':'+comment.id;
                  if(!s.selectedCommentKeys.has(key))throw Error('Rectangle failed to select comment');
                  const frame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                  if(!frame||getComputedStyle(nativeBox).visibility!=='hidden')throw Error('Mixed selection shows two frames');
                  const marker=b.root.querySelector('.miro-canvas-comment-marker'),pin=marker?.getBoundingClientRect(),outline=frame.getBoundingClientRect();
                  if(!pin||outline.left>pin.left||outline.right<pin.right||outline.top>pin.top||outline.bottom<pin.bottom)
                    throw Error('Mixed frame excludes selected comment avatar');
                  const line=b.root.querySelector('.miro-board-connector-hit[data-connector-id="menu-line"]')?.getBoundingClientRect();
                  if(!line||outline.left>line.left||outline.right<line.right||outline.top>line.top||outline.bottom<line.bottom)
                    throw Error('Mixed frame excludes a selected connector');
                  const before=b.runtime.getData(),saves=b.getSaves(),r=frame.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
                  frame.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:247,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:247,clientX:x+25,clientY:y+15}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:247,clientX:x+25,clientY:y+15}));
                  const after=b.runtime.getData();
                  if(after.nodes.find(n=>n.id==='n1').x!==before.nodes.find(n=>n.id==='n1').x+25
                    ||after.miroCanvas.connectors['menu-line'].from.x!==before.miroCanvas.connectors['menu-line'].from.x+25
                    ||after.miroCanvas.commentPlaces[key].x!==225||after.miroCanvas.commentPlaces[key].y!==195)
                    throw Error('Group frame did not move node, connector, and comment together');
                  if(b.getSaves()!==saves+1)throw Error('Mixed move wrote multiple undo steps');
                  b.runtime.undo();s.refresh();
                  if(JSON.stringify(b.runtime.getData())!==JSON.stringify(before))throw Error('Mixed move undo did not restore all items');
                  nativeBox.remove();s.resetTools();b.select('n1');
                }""")
                # The lasso armed from the bar stays armed: after a catch, and after the catch
                # is moved, which is one step of history.  A press on the catch moves it, as
                # with the select tool; a press anywhere else is a new lasso, which replaces it.
                page.evaluate("miroBrowser.session.resetTools();miroBrowser.session.armTool('lasso')")

                def lasso_round(left, top, right, bottom):
                    ring = page.evaluate("""([left, top, right, bottom]) => {
                      const s=miroBrowser.session;
                      return [[left,top],[right,top],[right,bottom],[left,bottom],[left,top]].map(([x,y])=>s.viewportPoint({x,y}));
                    }""", [left, top, right, bottom])
                    page.mouse.move(ring[0]['x'], ring[0]['y'])
                    page.mouse.down()
                    for corner in ring[1:]:
                        page.mouse.move(corner['x'], corner['y'], steps=3)
                    page.mouse.up()

                caught = "[...miroBrowser.runtime.selection].map(node => node.getData().id).sort()"
                lasso_round(20, 60, 680, 330)
                assert page.evaluate("miroBrowser.session.armedTool") == 'lasso'
                assert page.evaluate("miroBrowser.root.getAttribute('data-miro-canvas-tool')") == 'lasso'
                selected = page.evaluate(caught)
                assert 'n1' in selected and 'file' in selected and 'image' not in selected, selected
                frame = page.locator('.miro-canvas-mixed-selection-frame')
                assert frame.is_visible(), 'The catch has no shared frame'
                before = page.evaluate("({x: miroBrowser.runtime.nodes.get('n1').x, saves: miroBrowser.getSaves()})")
                box = frame.bounding_box()
                page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                page.mouse.down()
                page.mouse.move(box['x'] + box['width'] / 2 + 40, box['y'] + box['height'] / 2 + 20, steps=5)
                page.mouse.up()
                after = page.evaluate("({x: miroBrowser.runtime.nodes.get('n1').x, saves: miroBrowser.getSaves(), tool: miroBrowser.session.armedTool})")
                assert abs(after['x'] - before['x'] - 40) < 1 and after['saves'] == before['saves'] + 1, (before, after)
                assert after['tool'] == 'lasso', after
                assert page.evaluate(caught) == selected
                # A press anywhere else, with a ring round the card below, takes the selection from the first catch.
                lasso_round(380, 330, 680, 570)
                assert page.evaluate("miroBrowser.session.armedTool") == 'lasso'
                assert page.evaluate(caught) == ['image'], page.evaluate(caught)
                page.evaluate("miroBrowser.runtime.undo();miroBrowser.session.refresh();miroBrowser.session.resetTools();miroBrowser.select('n1')")
                assert page.evaluate("miroBrowser.session.armedTool") == 'select'
                marker = page.locator('.miro-canvas-comment-marker').first
                before = marker.bounding_box()
                assert before is not None
                x, y = before['x'] + before['width'] / 2, before['y'] + before['height'] / 2
                page.mouse.move(x, y)
                page.mouse.down()
                # A refresh between press and first move must not cancel the pickup.
                page.evaluate("miroBrowser.session.refresh()")
                page.mouse.move(x + 90, y + 35, steps=6)
                page.mouse.up()
                after = marker.bounding_box()
                assert after is not None
                assert abs(after['x'] - before['x'] - 90) < 2, (before, after)
                assert abs(after['y'] - before['y'] - 35) < 2, (before, after)
                assert page.evaluate("miroBrowser.session.openThread===undefined"), 'Drag opened the comment card'
                marker.click()
                card = page.locator('.miro-canvas-thread')
                assert card.get_by_role('button', name='Delete comment', exact=True).is_visible()
                assert not card.get_by_role('button', name='Remove imported comment from board', exact=True).is_visible()
                card.get_by_role('button', name='Close', exact=True).click()
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;s.resetTools();s.connectorLayer.select(['menu-line']);
                  const first=b.runtime.getData().miroCanvas.connectors['menu-line'];
                  const press=()=>{
                    const grip=document.querySelector('.miro-canvas-handles [data-connector-end=from]');
                    const r=grip.getBoundingClientRect();
                    grip.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:91,clientX:r.x+6,clientY:r.y+6,bubbles:true,cancelable:true}));
                  };
                  press();
                  s.writeBoardConnectors([{...first,color:'#abcdef'}]);
                  const target=s.viewportPoint({x:-350,y:180});
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:91,clientX:target.x,clientY:target.y}));
                  const saved=b.runtime.getData().miroCanvas.connectors['menu-line'];
                  if(saved.color!=='#abcdef'||JSON.stringify(saved.from)!==JSON.stringify(first.from))throw Error('Stale drag overwrote a newer edit');
                  const original=s.settings;s.settings={...original,connectorAllowFree:false};
                  press();
                  const node=s.viewportPoint({x:100,y:180});
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:91,clientX:node.x,clientY:node.y}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:91,clientX:target.x,clientY:target.y}));
                  if(JSON.stringify(b.runtime.getData().miroCanvas.connectors['menu-line'].from)!==JSON.stringify(first.from))throw Error('Invalid release attached to an earlier target');
                  s.settings=original;
                  const block={...saved,block:true,startCap:'none',endCap:'none'};
                  s.writeBoardConnectors([block]);s.connectorLayer.select(['menu-line']);
                  s.applyElementStyle({connector:{startCap:'stealth',endCap:'none'}});
                  const hit=document.querySelector('[data-connector-id="menu-line"]');
                  if(!['none','transparent'].includes(hit.getAttribute('fill')))throw Error('Hit overlay paints over block arrow');
                  if(!b.runtime.getData().miroCanvas.connectors['menu-line'].block)throw Error('Swapping block head lost block style');
                  s.applyElementStyle({connector:{startCap:'none',endCap:'none'}});
                  if(b.runtime.getData().miroCanvas.connectors['menu-line'].block)throw Error('Removing block head did not make a line');
                  s.connectorWidth=11;
                  s.createLine({route:'straight',block:true,width:16},[{x:-600,y:-400},{x:-500,y:-400}]);
                  if(!Object.values(b.runtime.getData().miroCanvas.connectors).some(c=>c.block&&c.width===11))throw Error('Block ignored width control');
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;s.resetTools();
                  const base={route:'straight',color:'#123456',width:2,startCap:'none',endCap:'arrow'};
                  s.writeBoardConnectors([
                    {...base,id:'group-a',from:{type:'free',x:-350,y:-180},to:{type:'free',x:-150,y:-180}},
                    {...base,id:'group-b',from:{type:'free',x:-350,y:-120},to:{type:'free',x:-150,y:-120}}
                  ]);
                  s.connectorLayer.select(['group-a','group-b']);b.root.focus();
                  b.groupBefore=b.runtime.getData();b.groupSaves=b.getSaves();
                  b.originalGetData=b.runtime.getData;
                  b.runtime.getData=function(){const d=b.originalGetData.call(this);d.nodes[0].subpath=undefined;d.edges[0].label=undefined;return d;};
                }""")
                start = page.evaluate("miroBrowser.session.viewportPoint({x:-250,y:-180})")
                page.mouse.move(start['x'], start['y'])
                page.mouse.down()
                page.mouse.move(start['x'] + 70, start['y'] + 35, steps=6)
                page.evaluate("miroBrowser.session.refresh()")
                assert page.evaluate("miroBrowser.getSaves()===miroBrowser.groupSaves")
                page.mouse.up()
                page.evaluate("""() => {
                  const b=miroBrowser;b.runtime.getData=b.originalGetData;b.session.refresh();
                  for(const id of ['group-a','group-b']){
                    const c=b.runtime.getData().miroCanvas.connectors[id],old=b.groupBefore.miroCanvas.connectors[id];
                    if(Math.abs(c.from.x-old.from.x-70)>1||Math.abs(c.from.y-old.from.y-35)>1)throw Error('Group drag snapped back: '+id+' '+JSON.stringify({now:c.from,before:old.from,diagnostics:b.session.transientDiagnostics.slice(-3)}));
                  }
                  if(b.getSaves()!==b.groupSaves+1)throw Error('Group drag was not one save');
                  b.runtime.undo();b.session.refresh();
                  if(JSON.stringify(b.runtime.getData())!==JSON.stringify(b.groupBefore))throw Error('Group undo failed');
                  b.runtime.redo();b.session.refresh();
                  if(b.runtime.getData().miroCanvas.connectors['group-b'].from.x!==-280)throw Error('Group redo failed');
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;s.resetTools();
                  for(const route of ['straight','curved','elbowed']) {
                    const c={id:'reshape-'+route,from:{type:'node',nodeId:'n1',u:1,v:0.5},to:{type:'node',nodeId:'file',u:0,v:0.5},route,color:'#223344',width:2,startCap:'none',endCap:'arrow'};
                    s.writeBoardConnectors([c]);s.connectorLayer.select([c.id]);s.armTool('connector');
                    const grip=b.root.querySelector('[data-route-grip]');
                    if(!grip)throw Error('Missing body grips: '+route);
                    const r=grip.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
                    const hit=b.root.querySelector('[data-connector-id="'+c.id+'"]'),saves=b.getSaves();
                    const shown=()=>b.root.querySelector('.miro-canvas-handles__preview path')?.getAttribute('d')??'';
                    const before=shown();
                    // Press the path itself, not the grip: attached bodies must bend too.
                    hit.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:98,clientX:x,clientY:y,bubbles:true}));
                    window.dispatchEvent(new PointerEvent('pointermove',{pointerId:98,clientX:x+40,clientY:y+50}));
                    if(shown()===before)throw Error('Body preview did not change: '+route);
                    s.refresh();
                    if(b.getSaves()!==saves)throw Error('Body preview saved early');
                    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:98,clientX:x+40,clientY:y+50}));
                    const next=b.runtime.getData().miroCanvas.connectors[c.id];
                    if(!next.waypoints.length||JSON.stringify(next.from)!==JSON.stringify(c.from)||JSON.stringify(next.to)!==JSON.stringify(c.to))throw Error('Reshape lost endpoint anchors');
                    if(b.getSaves()!==saves+1)throw Error('Reshape was not one history step');
                    b.runtime.undo();s.refresh();
                    if(b.runtime.getData().miroCanvas.connectors[c.id].waypoints)throw Error('Reshape undo failed');
                    b.runtime.redo();s.refresh();
                    if(!b.runtime.getData().miroCanvas.connectors[c.id].waypoints.length)throw Error('Reshape redo failed');
                  }
                }""")
                # Latest user regressions: author controls, comment anchors, circular ink,
                # independent cap sizing and rotation previews must work together.
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;s.resetTools();s.armTool('pen');
                  const picker=b.root.querySelector('[aria-label="New drawing color"]');
                  const r=picker.getBoundingClientRect();
                  if(Math.abs(r.width-r.height)>1||r.width>24)throw Error('Custom color is not circular');
                  s.resetTools();
                  const at={x:-200,y:-180};s.composeComment(at,s.viewportPoint(at));
                }""")
                card = page.locator('.miro-canvas-thread')
                card.get_by_label('Author name', exact=True).fill('Before posting')
                card.get_by_label('Reply', exact=True).fill('Author and connector regression')
                card.get_by_role('button', name='Send reply', exact=True).click()
                card.get_by_label('Edit author name', exact=True).fill('After posting')
                page.evaluate('miroBrowser.session.refresh()')
                assert card.get_by_label('Edit author name', exact=True).input_value() == 'After posting'
                card.get_by_label('Edit author name', exact=True).press('Enter')
                page.evaluate('miroBrowser.colorSaves=miroBrowser.getSaves()')
                card.get_by_label('Comment color', exact=True).evaluate("""el => {
                  el.focus();
                  for(const value of ['#405080','#664499','#3f66aa']){
                    el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
                  }
                }""")
                page.evaluate('miroBrowser.session.refresh()')
                assert card.get_by_label('Comment color', exact=True).input_value() == '#3f66aa'
                assert page.evaluate('miroBrowser.getSaves()===miroBrowser.colorSaves'), 'Picker movement wrote to the board'
                assert page.evaluate("""() => {
                  const b=miroBrowser,t=b.session.commentThreads().find(t=>t.text==='Author and connector regression');
                  return b.root.querySelector('[data-comment-id="'+t.id+'"]').style.getPropertyValue('--miro-avatar')==='#3f66aa';
                }"""), 'Comment pin did not preview the color immediately'
                card.get_by_label('Comment color', exact=True).evaluate("el => el.dispatchEvent(new Event('change',{bubbles:true}))")
                assert page.evaluate('miroBrowser.getSaves()===miroBrowser.colorSaves+1'), 'Color selection did not save exactly once'
                card.get_by_role('button', name='Lock comment', exact=True).click()
                assert card.get_by_role('button', name='Delete comment', exact=True).is_disabled()
                assert card.get_by_label('Mark as resolved', exact=True).is_disabled()
                assert card.get_by_label('Comment color', exact=True).is_disabled()
                assert card.get_by_label('Edit author name', exact=True).count() == 0
                assert card.locator('.miro-canvas-thread__composer').is_hidden()
                assert card.locator('.miro-canvas-thread__note').inner_text().startswith('Locked comment')
                assert page.evaluate("""() => {
                  const b=miroBrowser,t=b.session.commentThreads().find(t=>t.text==='Author and connector regression');
                  return b.root.querySelector('.miro-canvas-comment-marker[data-comment-id="'+t.id+'"]')?.getAttribute('data-comment-locked')==='true';
                }"""), 'Comment pin does not indicate its locked state'
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  const thread=s.commentThreads().find(t=>t.text==='Author and connector regression');
                  if(thread.author.name!=='After posting')throw Error('Author rename was not saved');
                  if(thread.color!=='#3f66aa'||thread.locked!==true)throw Error('Comment color or lock was not saved');
                  if(b.runtime.getData().miroCanvas.commentDecorations['local:'+thread.id]?.color!=='#3f66aa')
                    throw Error('Colour existed only in the card and not in board metadata');
                  const original=JSON.stringify(b.runtime.getData().miroCanvas.commentPlaces??{});
                  s.moveCommentThread(thread.id,'local',s.viewportPoint({x:400,y:500}));
                  if(JSON.stringify(b.runtime.getData().miroCanvas.commentPlaces??{})!==original)throw Error('Locked comment moved');
                  b.pinId=thread.id;
                  s.connectorHeadSize=30;s.connectorWidth=2;s.updateQuickTools();
                }""")
                card.get_by_role('button', name='Unlock comment', exact=True).click()
                assert card.locator('.miro-canvas-thread__composer').is_visible()
                assert card.get_by_label('Mark as resolved', exact=True).is_enabled()
                assert page.evaluate("""() => {
                  const b=miroBrowser;
                  return b.root.querySelector('.miro-canvas-comment-marker[data-comment-id="'+b.pinId+'"]')?.getAttribute('data-comment-locked')==='false';
                }"""), 'Comment pin did not clear its locked state'
                # The header holds icon buttons only: a tick to resolve and a "?" beside it,
                # with no caption or switch, and none of them squeezed.
                assert card.locator('.miro-canvas-thread__resolve-label, .miro-canvas-thread__switch, [role="switch"]').count() == 0
                widths = card.locator('.miro-canvas-thread__header button').evaluate_all(
                    "buttons => buttons.filter(b => b.offsetParent !== null).map(b => Math.round(b.getBoundingClientRect().width))")
                assert len(widths) >= 6 and set(widths) == {28}, f'Header icon buttons differ in size: {widths}'
                header_order = card.locator('.miro-canvas-thread__header button').evaluate_all(
                    "buttons => buttons.slice(0, 2).map(b => b.className.split(' ').pop())")
                assert header_order == ['miro-canvas-thread__resolve', 'miro-canvas-thread__help-button'], header_order
                # The "?" explains resolving as its tooltip and, on a press, under the header.
                help_button = card.locator('.miro-canvas-thread__help-button')
                help_note = card.locator('.miro-canvas-thread__help')
                assert help_button.get_attribute('aria-label').startswith('A resolved thread stays on the board')
                assert help_note.is_hidden()
                help_button.click()
                assert help_note.is_visible() and help_button.get_attribute('aria-expanded') == 'true'
                help_button.click()
                assert help_note.is_hidden()
                # A pin is the comment tool's speech bubble with its tip on the comment's
                # point, filled with the author's colour.
                pin_look = """() => {
                  const b=miroBrowser,pin=b.root.querySelector('.miro-canvas-comment-marker[data-comment-id="'+b.pinId+'"]');
                  const path=pin.querySelector('.miro-canvas-comment-marker__shape path');
                  const tick=pin.querySelector('.miro-canvas-comment-marker__tick'),initial=pin.querySelector('.miro-canvas-comment-marker__initial');
                  const probe=document.createElement('i');probe.style.color=pin.style.getPropertyValue('--miro-avatar');
                  document.body.appendChild(probe);const expected=getComputedStyle(probe).color;probe.remove();
                  const overlay=pin.parentElement.getBoundingClientRect(),box=pin.getBoundingClientRect();
                  return {state:pin.getAttribute('data-comment-state'),avatar:pin.style.getPropertyValue('--miro-avatar'),
                    fill:getComputedStyle(path).fill,expected,d:path.getAttribute('d'),
                    background:getComputedStyle(pin).backgroundColor,ink:getComputedStyle(pin).color,
                    tick:getComputedStyle(tick).display,initial:getComputedStyle(initial).display,letter:initial.textContent,
                    tipOffX:box.left-overlay.left-parseFloat(pin.style.left),tipOffY:box.bottom-overlay.top-parseFloat(pin.style.top),
                    size:[box.width,box.height],children:pin.children.length};
                }"""
                open_pin = page.evaluate(pin_look)
                assert open_pin['state'] == 'open' and open_pin['d'] == 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z', open_pin
                assert open_pin['fill'] == open_pin['expected'], f'Pin is not filled with its author colour: {open_pin}'
                assert open_pin['tick'] == 'none' and open_pin['initial'] != 'none' and open_pin['letter'], open_pin
                assert abs(open_pin['tipOffX']) <= 0.5 and abs(open_pin['tipOffY']) <= 0.5, f'Bubble tip is off the comment point: {open_pin}'
                assert open_pin['size'] == [32, 32], open_pin
                # The button itself is bare; the bubble inside it carries the colour.
                assert open_pin['background'] == 'rgba(0, 0, 0, 0)', open_pin
                # Resolving is one history step; the pin keeps its colour and shows a tick
                # where the author's letter was; the tick button shows the state.
                saves = page.evaluate('miroBrowser.getSaves()')
                tick_button = card.get_by_role('button', name='Mark as resolved', exact=True)
                assert tick_button.get_attribute('aria-pressed') == 'false'
                tick_button.click()
                assert page.evaluate('miroBrowser.getSaves()') == saves + 1, 'Resolving was not one history step'
                resolved_pin = page.evaluate(pin_look)
                assert resolved_pin['state'] == 'resolved', resolved_pin
                assert resolved_pin['avatar'] == open_pin['avatar'] and resolved_pin['fill'] == open_pin['fill'], f'Resolved pin changed colour: {resolved_pin}'
                assert resolved_pin['background'] == open_pin['background'] and resolved_pin['ink'] == open_pin['ink'], f'Resolved pin went grey: {resolved_pin}'
                assert resolved_pin['tick'] != 'none' and resolved_pin['initial'] == 'none', f'Resolved pin does not show a tick: {resolved_pin}'
                assert resolved_pin['children'] == open_pin['children'], 'Resolving re-made the pin'
                reopen_button = card.get_by_role('button', name='Reopen', exact=True)
                assert reopen_button.get_attribute('aria-pressed') == 'true'
                page.evaluate('() => {miroBrowser.runtime.undo();miroBrowser.session.refresh();}')
                assert page.evaluate(pin_look)['state'] == 'open', 'One undo did not reopen the resolved thread'
                assert card.get_by_role('button', name='Mark as resolved', exact=True).get_attribute('aria-pressed') == 'false'
                page.evaluate('() => {miroBrowser.runtime.redo();miroBrowser.session.refresh();}')
                assert page.evaluate(pin_look)['state'] == 'resolved', 'Redo did not resolve the thread again'
                card.get_by_role('button', name='Reopen', exact=True).click()
                assert page.evaluate(pin_look)['state'] == 'open'
                assert card.get_by_role('button', name='Mark as resolved', exact=True).get_attribute('aria-pressed') == 'false'
                card.get_by_label('Reply', exact=True).fill('Temporary reply')
                card.get_by_role('button', name='Send reply', exact=True).click()
                assert card.get_by_role('button', name='Delete reply', exact=True).is_visible()
                page.evaluate("""() => {const b=miroBrowser,card=b.session.commentCard,h=card.host,original=h.onDeleteReply;b.replyCardBefore={thread:card.thread?.id,immutable:card.thread?.immutable,origin:card.thread?.origin,open:b.session.openThread};h.onDeleteReply=(...args)=>{b.replyDeleteCalled=args;original(...args);};}""")
                card.get_by_role('button', name='Delete reply', exact=True).click()
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  if(s.commentThreads().find(t=>t.id===b.pinId).replies.length!==0)throw Error('Deleting one reply failed: '+JSON.stringify({called:b.replyDeleteCalled,cardBefore:b.replyCardBefore,cardAfter:{thread:s.commentCard.thread?.id,open:s.openThread},replies:s.commentThreads().find(t=>t.id===b.pinId).replies,locked:s.commentLocked(b.pinId,'local'),status:s.transientDiagnostics}));
                  s.closeCommentThread();s.armTool('connector');s.toolShape='arrow';
                }""")
                pin = page.locator('.miro-canvas-comment-marker[data-comment-id="' + page.evaluate('miroBrowser.pinId') + '"]')
                box = pin.bounding_box()
                assert box is not None
                page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
                page.mouse.down()
                target = page.evaluate('miroBrowser.session.viewportPoint({x:40,y:180})')
                page.mouse.move(target['x'], target['y'], steps=6)
                page.mouse.up()
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  const c=Object.values(b.runtime.getData().miroCanvas.connectors).find(c=>c.from.type==='comment'&&c.from.commentId===b.pinId);
                  if(!c||c.to.type!=='node'||c.to.nodeId!=='n1')throw Error('Cannot drag arrow from comment to node');
                  if(c.headSize!==30)throw Error('Creation lost head size');
                  s.resetTools();s.connectorLayer.select([c.id]);s.readInteractionState();s.applyElementStyle({connector:{width:8}});
                  if(b.runtime.getData().miroCanvas.connectors[c.id].headSize!==30)throw Error('Width overwrote head size');
                  const visible=()=>b.root.querySelector('[data-connector-id="'+c.id+'"]').previousElementSibling;
                  const markerId=visible().getAttribute('marker-end').slice(5,-1);
                  const marker=document.getElementById(markerId);
                  if(marker.getAttribute('markerUnits')!=='userSpaceOnUse')throw Error('Head still scales with width');
                  s.writeBoardConnectors([{id:'attached-free',from:{type:'node',nodeId:'n1',u:1,v:0.5},
                    to:{type:'free',x:500,y:140},waypoints:[{x:350,y:75}],route:'curved',
                    color:'#abcdef',width:2,startCap:'none',endCap:'arrow'}]);
                  const freeBefore=JSON.stringify(b.runtime.getData().miroCanvas.connectors['attached-free']);
                  const routeBefore=s.landingGeometry().geometry.edges['attached-free'];
                  const before=visible().getAttribute('d'),saves=b.getSaves();
                  s.previewRotation('n1',90);
                  if(visible().getAttribute('d')===before)throw Error('Connector did not follow rotation preview');
                  const routeDuring=s.landingGeometry().geometry.edges['attached-free'];
                  if(routeDuring.start.x===routeBefore.start.x&&routeDuring.start.y===routeBefore.start.y)
                    throw Error('Attached endpoint ignored node rotation');
                  if(routeDuring.end.x!==routeBefore.end.x||routeDuring.end.y!==routeBefore.end.y)
                    throw Error('Free endpoint rotated rigidly with node');
                  if(b.getSaves()!==saves)throw Error('Rotation preview saved early');
                  s.cancelHandleRotation();
                  if(visible().getAttribute('d')!==before)throw Error('Cancelled rotation left connector rotated');
                  s.setElementRotation('n1',90);s.refresh();
                  if(visible().getAttribute('d')===before)throw Error('Committed rotation missed connector');
                  if(JSON.stringify(b.runtime.getData().miroCanvas.connectors['attached-free'])!==freeBefore)
                    throw Error('Node rotation rewrote free connector geometry');
                  b.runtime.undo();s.refresh();
                  if(visible().getAttribute('d')!==before)throw Error('Rotation undo missed connector');
                  const pinMarker=b.root.querySelector('.miro-canvas-comment-marker[data-comment-id="'+b.pinId+'"]');
                  const r=pinMarker.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
                  const pinBefore=JSON.stringify(b.runtime.getData()),pathBefore=visible().getAttribute('d'),pinSaves=b.getSaves();
                  const press=pointerId=>pinMarker.dispatchEvent(new PointerEvent('pointerdown',
                    {button:0,pointerId,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                  const move=pointerId=>window.dispatchEvent(new PointerEvent('pointermove',
                    {pointerId,clientX:x+35,clientY:y+22,bubbles:true}));
                  press(87);move(87);
                  if(visible().getAttribute('d')===pathBefore)throw Error('Arrow lagged behind comment drag');
                  if(JSON.stringify(b.runtime.getData())!==pinBefore||b.getSaves()!==pinSaves)
                    throw Error('Comment drag preview wrote to the board');
                  window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:87,bubbles:true}));
                  if(visible().getAttribute('d')!==pathBefore)throw Error('Cancelled pin drag left arrow displaced');
                  press(88);move(88);
                  window.dispatchEvent(new PointerEvent('pointerup',
                    {pointerId:88,clientX:x+35,clientY:y+22,bubbles:true}));
                  if(visible().getAttribute('d')===pathBefore)throw Error('Committed pin drag lost arrow movement');
                  if(b.getSaves()!==pinSaves+1)throw Error('Pin drag did not commit once');
                  const pinPoint=s.landingGeometry().geometry.comments['local:'+b.pinId];
                  s.moveCommentThread(b.pinId,'local',s.viewportPoint({x:pinPoint.x+30,y:pinPoint.y+20}));
                  const after=s.landingGeometry().geometry.edges[c.id];
                  if(Math.abs(after.start.x-pinPoint.x-30)>1)throw Error('Connector did not follow moved comment');
                  s.openCommentThread(b.pinId,'local');
                  b.pinConnector=c.id;
                }""")
                card.get_by_role('button', name='Delete comment', exact=True).click()
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,c=b.runtime.getData().miroCanvas.connectors[b.pinConnector];
                  if(c.from.type!=='free')throw Error('Deleting comment left dangling arrow');
                  b.runtime.undo();s.refresh();
                  if(b.runtime.getData().miroCanvas.connectors[c.id].from.type!=='comment')throw Error('Undo did not restore comment attachment');
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;b.runtime.importData(b.initial);s.refresh();
                  s.writeBoardConnectors([{id:'mixed-line',route:'straight',color:'#abcdef',width:2,startCap:'none',endCap:'arrow',
                    from:{type:'free',x:-300,y:-150},to:{type:'free',x:-150,y:-90}}]);
                  b.select('n1');s.connectorLayer.select(['mixed-line']);s.refresh();
                  b.root.style.setProperty('--interactive-accent','#8038ff');
                  const frame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                  if(!frame)throw Error('Mixed selection has no shared frame');
                  const nativeBox=b.root.appendChild(document.createElement('div'));
                  nativeBox.className='canvas-selection';
                  if(!b.root.classList.contains('miro-canvas-mixed-selection--independent')
                    ||getComputedStyle(nativeBox).visibility!=='hidden'
                    ||getComputedStyle(frame).borderTopWidth==='0px')
                    throw Error('Independent connector selection must use only the shared visible frame: '+JSON.stringify({root:b.root.className,native:getComputedStyle(nativeBox).visibility,shared:getComputedStyle(frame).borderTopWidth}));
                  nativeBox.remove();
                  const f=frame.getBoundingClientRect(),n=b.node.nodeEl.getBoundingClientRect();
                  const a=s.viewportPoint({x:-300,y:-150}),z=s.viewportPoint({x:-150,y:-90});
                  if(f.left>Math.min(a.x,z.x)-5||f.right<n.right+5||f.top>Math.min(a.y,z.y)-5||f.bottom<n.bottom+5)
                    throw Error('Mixed frame excludes a selected element');
                  b.mixedBefore=b.runtime.getData();b.mixedSaves=b.getSaves();
                  b.root.addEventListener('pointerdown',e=>{b.mixedDown={target:e.target.className,ids:[...s.selectedIds],layer:s.connectorLayer.selection()};},true);
                }""")
                frame = page.locator('.miro-canvas-mixed-selection-frame')
                bounds = frame.bounding_box()
                assert bounds is not None
                page.mouse.move(bounds['x'] + 1, bounds['y'] + bounds['height'] / 2)
                page.mouse.down()
                page.mouse.move(bounds['x'] + 61, bounds['y'] + bounds['height'] / 2 + 30, steps=5)
                page.mouse.up()
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,d=b.runtime.getData(),old=b.mixedBefore;
                  const node=d.nodes.find(n=>n.id==='n1'),before=old.nodes.find(n=>n.id==='n1');
                  const line=d.miroCanvas.connectors['mixed-line'],prior=old.miroCanvas.connectors['mixed-line'];
                  if(node.x!==before.x+60||node.y!==before.y+30||line.from.x!==prior.from.x+60||line.from.y!==prior.from.y+30)
                    throw Error('Dragging shared frame did not move all selected elements: '+JSON.stringify({node:[node.x,node.y],before:[before.x,before.y],line:line.from,prior:prior.from,selected:s.selectedIds,down:b.mixedDown,saves:[b.getSaves(),b.mixedSaves]}));
                  if(b.getSaves()!==b.mixedSaves+1)throw Error('Mixed frame drag wrote more than one history step');
                  b.runtime.undo();s.refresh();
                  if(JSON.stringify(b.runtime.getData())!==JSON.stringify(old))throw Error('Mixed frame undo failed');
                  b.runtime.redo();s.refresh();
                  if(b.runtime.getData().miroCanvas.connectors['mixed-line'].from.x!==prior.from.x+60)throw Error('Mixed frame redo failed');
                  s.connectorLayer.reset();s.refresh();
                  if(b.root.querySelector('.miro-canvas-mixed-selection-frame'))throw Error('Mixed frame remained after connector deselection');
                  b.select('n1','file');s.refresh();
                  const nativeFrame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                  if(!nativeFrame || getComputedStyle(nativeFrame).pointerEvents!=='auto')
                    throw Error('Marquee-selected native items need a draggable frame interior');
                  let selectionMenus=0;const nativeMenu=b.runtime.onSelectionContextMenu;
                  b.runtime.onSelectionContextMenu=()=>{selectionMenus+=1;};
                  const menuEvent=new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true});
                  nativeFrame.dispatchEvent(menuEvent);
                  b.runtime.onSelectionContextMenu=nativeMenu;
                  if(selectionMenus!==1||!menuEvent.defaultPrevented)
                    throw Error('A right click on the shared frame must open the native selection menu');
                  const nativeBox=b.root.appendChild(document.createElement('div'));
                  nativeBox.className='canvas-selection';
                  if(b.root.classList.contains('miro-canvas-mixed-selection--independent')
                    ||getComputedStyle(nativeBox).visibility!=='visible'
                    ||getComputedStyle(nativeFrame).borderTopWidth!=='0px')
                    throw Error('Native-only selection has two visible frames');
                  nativeBox.remove();
                  const bounds=nativeFrame.getBoundingClientRect();
                  const x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;
                  if(!nativeFrame.contains(document.elementFromPoint(x,y)))
                    throw Error('The interior of the selection frame is not the hit target');
                  b.nativeFrameBefore=b.runtime.getData();
                  const stale=b.runtime.importData.bind(b.runtime);
                  b.runtime.importData=value=>{stale(value);b.runtime.selection.clear();};
                  b.nativeFrameImport=stale;
                }""")
                page.evaluate("""async () => {
                  const b=miroBrowser,s=b.session;
                  for(let drag=1;drag<=2;drag++){
                    const frame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                    if(!frame)throw Error('Native selection frame vanished after first move');
                    const r=frame.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,id=100+drag;
                    frame.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:id,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                    window.dispatchEvent(new PointerEvent('pointermove',{pointerId:id,clientX:x+25,clientY:y+15}));
                    window.dispatchEvent(new PointerEvent('pointerup',{pointerId:id,clientX:x+25,clientY:y+15}));
                    await Promise.resolve();
                    const ids=s.selectedIds;
                    if(!ids.includes('n1')||!ids.includes('file'))throw Error('Marquee selection disappeared after move '+drag);
                  }
                  const n=b.runtime.getData().nodes.find(item=>item.id==='n1');
                  const old=b.nativeFrameBefore.nodes.find(item=>item.id==='n1');
                  if(n.x!==old.x+50||n.y!==old.y+30)throw Error('Native frame did not move twice');
                  b.runtime.importData=b.nativeFrameImport;b.select('n1');
                  const focused=b.runtime.nodes.get('n1').nodeEl;focused.classList.add('is-focused');s.refresh();
                  const handles=b.root.querySelector('.miro-canvas-handles__frame');
                  if(!handles||handles.getAttribute('data-miro-canvas-turned')!=='false'
                    ||handles.getAttribute('data-miro-native-outline')!=='true'
                    ||getComputedStyle(handles).outlineStyle!=='none')
                    throw Error('Unrotated node still has two selection outlines');
                  focused.classList.remove('is-focused');s.refresh();
                }""")
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session,document=b.runtime.getData();
                  // A labelled native edge shows the plugin's label on the route the plugin
                  // draws, with native Canvas's own label hidden.
                  const ours=()=>b.root.querySelector('.miro-canvas-connector-label[data-connector-id="e1"]');
                  const native=b.runtime.edges.get('e1').labelEl;
                  if(!ours()||native.style.visibility!=='hidden')throw Error('Native edge label is not stood in for');
                  const top=()=>ours().getBoundingClientRect().top;
                  const firstTop=top();
                  const preview=s.previewReshape('e1',{kind:'insert',index:0,x:0,y:0},s.viewportPoint({x:370,y:300}));
                  if(!preview||Math.abs(top()-firstTop)<1)throw Error('First native edge body drag left the label behind');
                  s.connectorLabels.clearPreview('e1');
                  document.miroCanvas??={schemaVersion:1};document.miroCanvas.localOverrides??={};
                  document.miroCanvas.localOverrides.e1={connector:{route:'straight',waypoints:[{x:370,y:250}]}};
                  b.runtime.importData(document);s.refresh();
                  if(!ours()||b.runtime.edges.get('e1').labelEl.style.visibility!=='hidden')throw Error('Reshaped native edge still shows its stale label');
                  const oldTop=top();
                  document.miroCanvas.localOverrides.e1.connector.waypoints=[{x:370,y:300}];
                  b.runtime.importData(document);s.refresh();
                  if(Math.abs(top()-oldTop)<1)throw Error('Native edge label lagged behind body move');
                  const route=s.landingGeometry().geometry.edges.e1.points;
                  const originalTop=top(),zoom=2**b.runtime.zoom;
                  s.connectorLabels.preview('e1',route.map(p=>({x:p.x,y:p.y+22})));
                  s.followViewport();
                  if(Math.abs(top()-originalTop-22*zoom)>1)
                    throw Error('Viewport frame reverted a live route-label preview');
                  s.connectorLabels.clearPreview('e1');s.followViewport();
                  if(Math.abs(top()-originalTop)>1)
                    throw Error('Cancelled route-label preview did not restore position');
                  b.select('e1');
                  ours().dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}));
                  const editor=ours().querySelector('.canvas-path-label');
                  if(editor.getAttribute('contenteditable')!=='true')throw Error('Reshaped native edge label cannot be edited');
                  editor.textContent='Edited edge';editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
                  if(b.runtime.getData().edges.find(e=>e.id==='e1').label!=='Edited edge')throw Error('Native edge label edit was not saved');
                  const r=ours().getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
                  ours().dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:459,clientX:x,clientY:y,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:459,clientX:x+20,clientY:y+10}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:459,clientX:x+20,clientY:y+10}));
                  const t=b.runtime.getData().miroCanvas.localOverrides.e1.connector.labelT;
                  if(typeof t!=='number'||t===0.5)throw Error('Native edge label cannot be moved along body: '+t);
                }""")
                # Obsidian on a tablet pads every button but its own icon buttons 20px
                # on each side, which the plugin's one- and two-class rules do not
                # outweigh.  Every button the plugin draws - found under its own roots,
                # not from a list of classes - must be the size and the padding on a
                # tablet that it is without Obsidian's rule, in every panel the board
                # can have open: the comment pin and its card, the bars, the handles,
                # the dock, the search bar, the export, the command list and the tools.
                page.evaluate("""() => {
                  const b=miroBrowser,s=b.session;
                  // Obsidian's own rules for a button - its base rule, then the one a tablet adds - ahead of the plugin's styles, as in Obsidian.
                  const obsidian=document.createElement('style');
                  const baseRule=':root{--size-4-1:4px;--size-4-3:12px;--size-4-5:20px}button{padding:var(--size-4-1) var(--size-4-3)}';
                  const tabletRule='.is-tablet button:not(.clickable-icon){padding:var(--size-4-1) var(--size-4-5)}';
                  obsidian.textContent=baseRule+tabletRule;
                  document.head.prepend(obsidian);
                  const tablet=['is-mobile','is-tablet'].filter((name)=>!document.body.classList.contains(name));
                  const theirs=(element)=>/(^|\s)miro-(canvas|source)-/.test(String(element.className));
                  // The board, and whatever the plugin hangs on the page beside it.
                  const roots=()=>[b.root,...[...document.body.children].filter(theirs)];
                  const snapshot=(buttons)=>buttons.map((button)=>{
                    const style=getComputedStyle(button),box=button.getBoundingClientRect();
                    return {padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft].join(' '),width:Math.round(box.width*10)/10,height:Math.round(box.height*10)/10};
                  });
                  const classes=new Set();
                  const same=(where)=>{
                    const buttons=[...new Set(roots().flatMap((root)=>[...root.querySelectorAll('button')]))];
                    // Hold the device layout constant; compare only the host padding rule.
                    document.body.classList.add(...tablet);
                    obsidian.textContent=baseRule;
                    const without=snapshot(buttons);
                    obsidian.textContent=baseRule+tabletRule;
                    const on=snapshot(buttons);
                    document.body.classList.remove(...tablet);
                    const changed=[];
                    buttons.forEach((button,index)=>{
                      String(button.className).split(/\s+/).filter(Boolean).forEach((name)=>classes.add(name));
                      if(JSON.stringify(without[index])!==JSON.stringify(on[index]))
                        changed.push({button:String(button.className)||button.getAttribute('aria-label')||button.textContent,without:without[index],tablet:on[index]});
                    });
                    if(changed.length)throw Error('On a tablet '+changed.length+' of '+buttons.length+' buttons change with '+where+': '+JSON.stringify(changed.slice(0,6)));
                    return buttons.length;
                  };
                  let counted=0;
                  s.resetTools();
                  s.commentDraft={type:'free',x:260,y:210};s.createComment('Tablet pin');s.closeCommentThread();
                  b.root.querySelector('.miro-canvas-comment-marker')?.click();
                  b.select('n1');
                  counted+=same('a comment open and a card picked');
                  // The tick that resolves the thread, pressed in, and the "?" that explains it, lit.
                  b.root.querySelector('.miro-canvas-thread__resolve').click();
                  b.root.querySelector('.miro-canvas-thread__help-button').click();
                  counted+=same('a comment resolved and its help shown');
                  s.armTool('pen');counted+=same('the pen armed');
                  s.armTool('connector');counted+=same('the lines armed');
                  s.resetTools();
                  s.closeCommentThread();
                  s.toggleArrangeMode();counted+=same('the panels being arranged');s.toggleArrangeMode();
                  s.openSearch();counted+=same('the search bar open');s.closeSearch();
                  s.openCommandModal();counted+=same('the command list open');s.controls.closeCommandModal();
                  s.openExport();counted+=same('the export open');s.closeExport();
                  b.mountM2();counted+=same('the tools panel open');
                  obsidian.remove();
                  for(const name of ['miro-canvas-comment-marker','miro-canvas-thread__button','miro-canvas-thread__resolve','miro-canvas-thread__help-button','miro-canvas-toolbar__button','miro-canvas-dock__button','miro-canvas-handle'])
                    if(!classes.has(name))throw Error('The tablet check never reached a '+name+': '+[...classes].join(' '));
                  if(counted<120)throw Error('The tablet check reached only '+counted+' buttons');
                }""")
                assert errors == [], errors
                page.evaluate("miroBrowser.dispose()")
                browser.close()
                print("OK: shared menus, connector marquee and first-press comment drag (synthetic host)")
                return 0
            if args.interactions:
                # A double press on the empty board is Escape and makes no card, whatever tool is
                # armed, while a card still opens for writing.  A click on one of native Canvas's own
                # buttons only arms it; the next press on the board places its item there, within a
                # few pixels, and native drag-to-add from the button stays.  Real mouse events.
                empty = page.evaluate("""() => {
                  const b = miroBrowser, box = b.root.getBoundingClientRect();
                  b.session.resetTools();
                  return {x: box.left + 900, y: box.top + 450};
                }""")
                assert page.evaluate("([x, y]) => document.elementFromPoint(x, y) === miroBrowser.root", [empty["x"], empty["y"]]), \
                    "The point chosen for the empty board is covered"
                node_count = lambda: page.evaluate("miroBrowser.runtime.nodes.size")
                armed_now = lambda: page.evaluate("miroBrowser.session.armedTool")
                cards_before = node_count()
                for tool in ("select", "lasso", "connector"):
                    page.evaluate("(tool) => miroBrowser.session.armTool(tool)", tool)
                    page.mouse.dblclick(empty["x"], empty["y"])
                    assert node_count() == cards_before, f"A double click on the empty board made a card with {tool} armed"
                    assert armed_now() == "select", f"A double click on the empty board left {armed_now()} armed, not select, with {tool} armed"
                # A press with the lines tool swallows the next double click for half a second,
                # for the polyline it may be finishing.
                page.wait_for_timeout(600)
                card_at = page.evaluate("""() => {
                  const b = miroBrowser, r = b.node.nodeEl.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
                  return {x, y, covered: document.elementFromPoint(x, y)?.closest('.canvas-node') !== b.node.nodeEl};
                }""")
                assert not card_at["covered"], "The middle of the card is covered"
                page.mouse.dblclick(card_at["x"], card_at["y"])
                assert page.evaluate("miroBrowser.node.nodeEl.classList.contains('is-editing')"), "A double click on a card did not open it for writing"
                assert node_count() == cards_before, "A double click on a card made a card"
                page.evaluate("miroBrowser.node.nodeEl.classList.remove('is-editing')")
                # Native Canvas ignores a double click while a button has the keyboard focus, and its
                # press on the board does not move the focus off the tool just used: a card still
                # opens on a double click right after a tool of the bar was clicked.
                for first in ('[data-tool-group="drawing"]', '[data-tool="lasso"]'):
                    page.locator(f'.miro-canvas-tools {first}').click()
                    page.locator('.miro-canvas-tools [data-tool="select"]').click()
                    bar_has_focus = page.evaluate("document.activeElement?.closest('.miro-canvas-tools button') != null")
                    assert bar_has_focus, "The bar's button does not hold the focus after a click, so this check proves nothing"
                    card_at = page.evaluate("""() => {
                      const b = miroBrowser, r = b.node.nodeEl.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
                      return {x, y, covered: document.elementFromPoint(x, y)?.closest('.canvas-node') !== b.node.nodeEl};
                    }""")
                    assert not card_at["covered"], f"The middle of the card is covered after {first}"
                    page.mouse.dblclick(card_at["x"], card_at["y"])
                    opened = page.evaluate("miroBrowser.node.nodeEl.classList.contains('is-editing')")
                    assert opened, f"A double click on a card right after the bar's {first} did not open it for writing"
                    assert page.evaluate("document.activeElement?.closest('button, input') == null"), "The bar's button kept the focus through a press on the board"
                    page.evaluate("miroBrowser.node.nodeEl.classList.remove('is-editing')")
                page.evaluate("miroBrowser.session.resetTools()")
                card_button = page.locator('.miro-canvas-tools .canvas-card-menu-button[aria-label="Drag to add card"]')
                card_button.click()
                assert node_count() == cards_before, "A click on the card button made a card"
                assert armed_now() == "native" and card_button.get_attribute("aria-pressed") == "true", "A click on the card button did not arm it"
                steps_before = page.evaluate("miroBrowser.getHistoryLength()")
                page.mouse.click(empty["x"], empty["y"])
                assert node_count() == cards_before + 1, "The press on the board after the card button made no card"
                placed = page.evaluate("""([x, y]) => {
                  const b = miroBrowser, node = b.runtime.getData().nodes.at(-1), board = b.session.boardPoint({x, y});
                  return {dx: node.x + node.width / 2 - board.x, dy: node.y + node.height / 2 - board.y,
                    writing: b.runtime.nodes.get(node.id).nodeEl.classList.contains('is-editing')};
                }""", [empty["x"], empty["y"]])
                assert abs(placed["dx"]) < 3 and abs(placed["dy"]) < 3, f"The card was not placed where the board was pressed: {placed}"
                assert placed["writing"], "The new card did not open for writing"
                assert armed_now() == "select" and card_button.get_attribute("aria-pressed") == "false", "The card button stayed armed after placing"
                assert page.evaluate("miroBrowser.getHistoryLength()") == steps_before + 1, "Placing the card was not one history step"
                button_box = card_button.bounding_box()
                page.mouse.move(button_box["x"] + button_box["width"] / 2, button_box["y"] + button_box["height"] / 2)
                page.mouse.down()
                page.mouse.move(empty["x"] - 250, empty["y"], steps=6)
                page.mouse.up()
                assert node_count() == cards_before + 2 and armed_now() == "select", "Dragging the card button onto the board no longer makes a card"
                page.evaluate("miroBrowser.session.toggleReviewMode()")
                assert not card_button.is_visible(), "The creation button remains visible in review mode"
                card_button.evaluate("element => element.click()")
                assert armed_now() == "select" and card_button.get_attribute("aria-disabled") == "true", "The hidden card button armed in review mode"
                page.evaluate("miroBrowser.session.toggleReviewMode()")
                page.evaluate("() => { const b = miroBrowser; b.runtime.importData(b.initial); b.session.resetTools(); b.session.refresh(); }")
                assert node_count() == cards_before, "Putting the board back left the new cards"
                page.evaluate("""async () => {
                  const b = miroBrowser;
                  const check = (ok, message) => { if (!ok) throw Error(message); };
                  const clipboard = new DataTransfer();
                  b.select('n1'); b.root.focus();
                  const initialCount=b.runtime.nodes.size;
                  // Ctrl+C in any layout is the browser's: it raises the copy event itself.
                  const keyCopy=new KeyboardEvent('keydown',{code:'KeyC',key:'с',ctrlKey:true,bubbles:true,cancelable:true});
                  b.root.dispatchEvent(keyCopy);
                  check(!keyCopy.defaultPrevented,'Ctrl+C was taken from the browser');
                  const own=new DataTransfer();
                  b.root.dispatchEvent(new ClipboardEvent('copy',{clipboardData:own,bubbles:true,cancelable:true}));
                  check(own.getData('text/plain')==='Canvas text with native DOM inheritance','Copy reads as its card text elsewhere: '+own.getData('text/plain'));
                  b.root.dispatchEvent(new ClipboardEvent('paste',{clipboardData:own,bubbles:true,cancelable:true}));
                  check(b.runtime.nodes.size===initialCount+1,'Paste of a copy added no card');
                  b.runtime.undo(); b.session.refresh();
                  // A finger that presses a picked card and moves drags it - native Canvas
                  // drags with a finger only after a long press - in one history step.
                  {
                    b.select('n1');
                    const card=b.node.nodeEl;
                    card.classList.add('is-focused');
                    const first=b.runtime.getData().nodes.find(n=>n.id==='n1'),touchSaves=b.getSaves();
                    const at=card.getBoundingClientRect(),x=at.left+at.width/2,y=at.top+at.height/2;
                    const finger={button:0,pointerId:71,pointerType:'touch',isPrimary:true,bubbles:true,cancelable:true};
                    card.dispatchEvent(new PointerEvent('pointerdown',{...finger,clientX:x,clientY:y}));
                    for(let step=1;step<=8;step++)window.dispatchEvent(new PointerEvent('pointermove',{...finger,clientX:x+step*10,clientY:y+step*5}));
                    window.dispatchEvent(new PointerEvent('pointerup',{...finger,clientX:x+80,clientY:y+40}));
                    const moved=b.runtime.getData().nodes.find(n=>n.id==='n1');
                    check(moved.x>first.x&&moved.y>first.y,'A finger moving a picked card did not drag it: '+JSON.stringify([first.x,first.y,moved.x,moved.y]));
                    check(b.getSaves()===touchSaves+1,'A finger dragging a card wrote '+(b.getSaves()-touchSaves)+' history steps');
                    b.runtime.undo(); b.session.refresh();
                    const undone=b.runtime.getData().nodes.find(n=>n.id==='n1');
                    check(undone.x===first.x&&undone.y===first.y,'One undo did not put the dragged card back');
                    card.classList.remove('is-focused');
                    b.select('n1');
                    card.dispatchEvent(new PointerEvent('pointerdown',{...finger,pointerId:72,clientX:x,clientY:y}));
                    window.dispatchEvent(new PointerEvent('pointermove',{...finger,pointerId:72,clientX:x+60,clientY:y+30}));
                    window.dispatchEvent(new PointerEvent('pointerup',{...finger,pointerId:72,clientX:x+60,clientY:y+30}));
                    check(b.runtime.getData().nodes.find(n=>n.id==='n1').x===first.x,'A finger moving a card that is not picked dragged it');
                  }
                  b.select('n1', 'file');
                  b.node.nodeEl.tabIndex = 0;
                  b.node.nodeEl.focus();
                  const copy = new ClipboardEvent('copy', {clipboardData: clipboard, bubbles:true, cancelable:true});
                  b.node.nodeEl.dispatchEvent(copy);
                  check(copy.defaultPrevented, 'Copy from focused child was ignored');
                  const payload = JSON.parse(clipboard.getData('obsidian/canvas'));
                  check(payload.nodes.length === 2, 'Selection not copied');
                  check(payload.edges.length === 1, 'Internal connector not copied');
                  const before = b.runtime.nodes.size;
                  b.root.focus();
                  const pasteAt={x:235,y:140}, screen=b.session.viewportPoint(pasteAt);
                  b.root.dispatchEvent(new PointerEvent('pointermove',{clientX:screen.x,clientY:screen.y,bubbles:true}));
                  const oldIds=new Set(b.runtime.nodes.keys());
                  b.root.dispatchEvent(new ClipboardEvent('paste', {clipboardData:clipboard, bubbles:true, cancelable:true}));
                  check(b.runtime.nodes.size === before + 2, 'Paste did not add nodes');
                  const pasted=b.runtime.getData().nodes.filter(n=>!oldIds.has(n.id));
                  const cx=(Math.min(...pasted.map(n=>n.x))+Math.max(...pasted.map(n=>n.x+n.width)))/2;
                  const cy=(Math.min(...pasted.map(n=>n.y))+Math.max(...pasted.map(n=>n.y+n.height)))/2;
                  check(Math.abs(cx-pasteAt.x)<1&&Math.abs(cy-pasteAt.y)<1,'Paste missed pointer position');
                  const files = b.runtime.getData().nodes.filter(n => n.type === 'file' && n.file === 'attachments/Spec.pdf');
                  check(files.length === 2, 'Attachment did not reuse its file path');
                  check(b.sourceUnchanged(), 'Copy duplicated or changed Miro source');
                  b.root.dispatchEvent(new ClipboardEvent('cut', {clipboardData:new DataTransfer(), bubbles:true, cancelable:true}));
                  check(b.runtime.nodes.size === before, 'Cut did not remove pasted selection');
                  b.runtime.undo(); b.session.refresh();
                  check(b.runtime.nodes.size === before + 2, 'Cut undo lost nodes');
                  b.select('n1'); b.root.focus(); b.session.lockSelection();
                  b.root.dispatchEvent(new ClipboardEvent('cut', {clipboardData:new DataTransfer(), bubbles:true, cancelable:true}));
                  check(b.runtime.nodes.has('n1'), 'Cut removed a locked node');
                  b.session.unlockSelection();
                  const input = document.createElement('textarea'); b.root.append(input); input.focus();
                  const textCopy = new ClipboardEvent('copy', {clipboardData:new DataTransfer(), bubbles:true, cancelable:true});
                  input.dispatchEvent(textCopy);
                  check(!textCopy.defaultPrevented, 'Node copy stole text editing');
                  input.remove();
                  b.runtime.importData(b.initial); b.session.refresh();
                  b.select('n1'); b.root.focus();
                  const graph = b.runtime.getData();
                  graph.edges.push({id:'edge-target', fromNode:'file', fromSide:'bottom', toNode:'image', toSide:'top'});
                  b.runtime.importData(graph); b.session.refresh();
                  const geometry = b.session.landingGeometry().geometry;
                  const target = geometry.edges['edge-target'];
                  const point = {x:(target.start.x+target.end.x)/2, y:(target.start.y+target.end.y)/2};
                  b.session.moveConnectorEnd('e1', 'to', b.session.viewportPoint(point));
                  check(b.runtime.data.miroCanvas.localOverrides.e1.connectorAnchors.to.type === 'edge', 'Endpoint did not attach to another edge');
                  check(b.runtime.data.miroCanvas.localOverrides.e1.connectorAnchors.to.edgeId === 'edge-target', 'Wrong edge attached');
                  const nodeCount = b.runtime.nodes.size;
                  const dragSpec={kind:'arrow',route:'straight',endCap:'arrow',input:'drag'};
                  const at=b.session.viewportPoint({x:-280,y:-200});
                  const countBefore=Object.keys(b.runtime.getData().miroCanvas.connectors??{}).length;
                  const savesBeforeClick=b.getSaves();
                  b.session.startLine(dragSpec,new PointerEvent('pointerdown',{pointerId:120,button:0,clientX:at.x,clientY:at.y}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:120,clientX:at.x+2,clientY:at.y+1}));
                  check(Object.keys(b.runtime.getData().miroCanvas.connectors??{}).length===countBefore,'Click created a connector');
                  check(b.getSaves()===savesBeforeClick,'Click wrote connector history');
                  b.session.startLine(dragSpec,new PointerEvent('pointerdown',{pointerId:121,button:0,clientX:at.x,clientY:at.y}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:121,clientX:at.x+100,clientY:at.y+30}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:121,clientX:at.x+100,clientY:at.y+30}));
                  check(Object.keys(b.runtime.getData().miroCanvas.connectors??{}).length===countBefore+1,'Drag failed to create connector');
                  b.runtime.undo();b.session.refresh();
                  b.session.createLine({kind:'arrow',route:'straight',endCap:'arrow',input:'drag'}, [{x:1500,y:1400},{x:1700,y:1400}]);
                  check(b.runtime.nodes.size === nodeCount, 'Free connector created a node');
                  const connectors = b.runtime.getData().miroCanvas.connectors;
                  const id = Object.keys(connectors)[0];
                  check(!!id, 'Free connector was not persisted');
                  check(b.root.querySelector('[data-connector-id="'+id+'"]'), 'Free connector was not rendered');
                  const saved = JSON.parse(JSON.stringify(b.runtime.getData()));
                  b.runtime.undo(); b.session.refresh();
                  check(!b.runtime.getData().miroCanvas.connectors?.[id], 'Connector undo failed');
                  b.runtime.redo(); b.session.refresh();
                  check(b.runtime.getData().miroCanvas.connectors[id].endCap === 'arrow', 'Connector redo lost style');
                  b.runtime.importData(saved); b.session.refresh();
                  b.session.resetTools();
                  b.root.querySelector('[data-connector-id="'+id+'"]').dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:25,bubbles:true}));
                  window.dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:25,bubbles:true}));
                  const connectorClipboard = new DataTransfer();
                  b.root.focus(); b.root.dispatchEvent(new ClipboardEvent('copy',{clipboardData:connectorClipboard,bubbles:true,cancelable:true}));
                  check(JSON.parse(connectorClipboard.getData('obsidian/canvas')).connectors.length === 1, 'Connector selection not copied');
                  b.root.dispatchEvent(new ClipboardEvent('paste',{clipboardData:connectorClipboard,bubbles:true,cancelable:true}));
                  check(Object.keys(b.runtime.getData().miroCanvas.connectors).length === 2, 'Connector paste failed: '+JSON.stringify(b.session.transientDiagnostics));
                  check(b.runtime.nodes.size === nodeCount, 'Connector paste created nodes');
                  b.session.armTool('connector');
                  check(!b.root.querySelector('.miro-canvas-tools__connectors').hidden,'Connector palette closed while tool is active');
                  b.runtime.tx=400; b.runtime.x=80; b.runtime.ty=200; b.runtime.y=30;
                  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                  const displayed=b.session.viewportPoint({x:80,y:30}), box=b.root.getBoundingClientRect();
                  check(Math.abs(displayed.x-box.left-box.width/2)<1,'Overlay follows target camera instead of displayed camera');
                  check(b.session.minimap.viewport.x===80,'Minimap lags behind displayed camera');
                  b.session.resetTools();
                  check(b.session.armedTool==='select' && b.root.querySelector('.miro-canvas-tools__connectors').hidden,'Reset did not clear connector mode');
                  b.root.querySelector('[data-tool="connector"]').click();
                  check(!b.root.querySelector('.miro-canvas-tools__connectors').hidden,'Connector palette did not open');
                  check(!b.root.querySelector('[data-tool="connector"]').closest('.miro-canvas-toolbar__popover'),'Duplicate connector popover remains');
                  check(b.root.querySelectorAll('.miro-canvas-tools__connectors [data-shape]').length===7,'Connector palette lost a route kind');
                  b.session.resetTools();
                  b.runtime.setViewport(0,0,0);
                  clearInterval(b.session.refreshTimer); b.session.refreshTimer=undefined;
                  const bound={id:'live-bound',from:{type:'node',nodeId:'n1',u:1,v:0.5},to:{type:'node',nodeId:'file',u:0,v:0.5},route:'straight',color:'#334455',width:2,startCap:'none',endCap:'arrow'};
                  check(b.session.writeBoardConnectors([bound]),'Live test connector was refused');
                  const pathBefore=b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d');
                  const savesBeforeDrag=b.getSaves();
                  // Native Canvas selects the card it starts to drag.
                  b.select('n1');
                  b.node.nodeEl.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:91,bubbles:true}));
                  b.node.nodeEl.style.left=(parseFloat(b.node.nodeEl.style.left)+90)+'px';
                  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                  const pathDuring=b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d');
                  check(pathDuring!==pathBefore,'Attached connector waited for polling while its node moved');
                  check(b.getSaves()===savesBeforeDrag,'Live node preview wrote history');
                  window.dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:91,bubbles:true}));
                  // Finish the native drag's own save/history boundary before testing another gesture.
                  b.runtime.data=b.runtime.getData(); b.runtime.requestSave(true); b.session.refresh();
                  const savesBeforeFreeDrag=b.getSaves();
                  const freeHit=b.root.querySelector('[data-connector-id="'+id+'"]');
                  const freeBefore=freeHit.getAttribute('d');
                  freeHit.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:92,clientX:500,clientY:400,bubbles:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:92,clientX:550,clientY:425,bubbles:true}));
                  check(b.root.querySelector('[data-connector-id="'+id+'"]').getAttribute('d')!==freeBefore,'Line drag preview waited for release');
                  check(b.getSaves()===savesBeforeFreeDrag,'Line drag preview saved before release');
                  window.dispatchEvent(new PointerEvent('pointerup',{button:0,pointerId:92,clientX:550,clientY:425,bubbles:true}));
                  b.session.resetTools(); b.select('n1'); b.root.focus();
                  b.root.querySelector('[data-connector-id="'+id+'"]').dispatchEvent(new PointerEvent('pointerdown',{button:0,shiftKey:true,pointerId:93,bubbles:true}));
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:93,bubbles:true}));
                  const mixedCopy=new DataTransfer();
                  b.root.dispatchEvent(new ClipboardEvent('copy',{clipboardData:mixedCopy,bubbles:true,cancelable:true}));
                  const mixed=JSON.parse(mixedCopy.getData('obsidian/canvas'));
                  check(mixed.nodes.length===1 && mixed.connectors.length===1,'Shift selection did not copy nodes and connectors together');
                  const beforeMixedPaste=b.runtime.getData();
                  b.root.dispatchEvent(new ClipboardEvent('paste',{clipboardData:mixedCopy,bubbles:true,cancelable:true}));
                  check(b.runtime.nodes.size===beforeMixedPaste.nodes.length+1,'Mixed paste lost its node');
                  check(Object.keys(b.runtime.getData().miroCanvas.connectors).length===Object.keys(beforeMixedPaste.miroCanvas.connectors).length+1,'Mixed paste lost its connector');
                  b.runtime.undo(); b.session.refresh();
                  check(JSON.stringify(b.runtime.getData())===JSON.stringify(beforeMixedPaste),'Mixed paste undo was not atomic');
                  check(b.session.writeBoardConnectors([{id:'chain-bound',from:{type:'edge',edgeId:'live-bound',t:0.5},
                    to:{type:'free',x:750,y:310},route:'straight',color:'#6688aa',width:2,startCap:'none',endCap:'arrow'}]),
                    'Dependent connector could not be created');
                  b.session.resetTools(); b.select('n1'); b.session.connectorLayer.select([id]); b.root.focus();
                  const beforeMixed=b.runtime.getData(), savesBeforeMixed=b.getSaves();
                  const attachedBefore=b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d');
                  const chainBefore=b.root.querySelector('[data-connector-id="chain-bound"]').getAttribute('d');
                  b.root.querySelector('[data-connector-id="'+id+'"]').dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:94,clientX:500,clientY:400,bubbles:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:94,clientX:560,clientY:420,bubbles:true}));
                  check(b.getSaves()===savesBeforeMixed,'Mixed drag preview wrote history');
                  check(b.node.nodeEl.style.translate==='60px 20px','Mixed drag did not preview node movement');
                  check(b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d')!==attachedBefore,
                    'Unselected arrow attached to a moving node lagged during group drag');
                  check(b.root.querySelector('[data-connector-id="chain-bound"]').getAttribute('d')!==chainBefore,
                    'Connector-to-connector chain lagged during group drag');
                  window.dispatchEvent(new PointerEvent('pointerup',{pointerId:94,clientX:560,clientY:420,bubbles:true}));
                  check(b.runtime.getData().nodes.find(n=>n.id==='n1').x===beforeMixed.nodes.find(n=>n.id==='n1').x+60,'Mixed drag did not move node');
                  check(b.runtime.getData().miroCanvas.connectors[id].from.x===beforeMixed.miroCanvas.connectors[id].from.x+60,'Mixed drag did not move connector');
                  b.runtime.undo(); b.session.refresh();
                  check(JSON.stringify(b.runtime.getData())===JSON.stringify(beforeMixed),'Mixed drag undo was not atomic');
                  b.runtime.setViewport(0,0,1);b.session.refresh();
                  b.select('n1');b.session.connectorLayer.select([id]);
                  const zoomBefore=b.runtime.getData(),zoomPath=b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d');
                  const zoomSaves=b.getSaves();
                  b.root.querySelector('[data-connector-id="'+id+'"]').dispatchEvent(new PointerEvent('pointerdown',
                    {button:0,pointerId:99,clientX:500,clientY:400,bubbles:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:99,clientX:560,clientY:420,bubbles:true}));
                  check(b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d')!==zoomPath,
                    'Attached arrow lagged at non-default zoom');
                  check(b.getSaves()===zoomSaves,'Zoomed group preview saved before release');
                  window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:99,bubbles:true}));
                  check(JSON.stringify(b.runtime.getData())===JSON.stringify(zoomBefore),'Cancelled zoomed group drag changed data');
                  check(b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d')===zoomPath,
                    'Cancelled zoomed group drag left arrow displaced');
                  b.runtime.setViewport(0,0,0);b.session.refresh();
                  b.session.resetTools();b.select('file','image');
                  const attachmentFrame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                  check(!!attachmentFrame,'Attachment group has no shared frame');
                  const attachmentPath=b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d');
                  const attachmentBox=attachmentFrame.getBoundingClientRect(),px=attachmentBox.left+attachmentBox.width/2,py=attachmentBox.top+attachmentBox.height/2;
                  attachmentFrame.dispatchEvent(new PointerEvent('pointerdown',
                    {button:0,pointerId:108,clientX:px,clientY:py,bubbles:true,cancelable:true}));
                  window.dispatchEvent(new PointerEvent('pointermove',{pointerId:108,clientX:px+45,clientY:py+20,bubbles:true}));
                  check(b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d')!==attachmentPath,
                    'Arrow lagged behind a grouped file/image attachment');
                  window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:108,bubbles:true}));
                  check(b.root.querySelector('[data-connector-id="live-bound"]').getAttribute('d')===attachmentPath,
                    'Cancelling attachment drag left its arrow displaced');
                  b.session.resetTools(); b.select('n1'); b.session.connectorLayer.select([id]); b.root.focus();
                  const beforeDelete=b.runtime.getData();
                  b.runtime.deleteSelection(); b.session.refresh();
                  check(!b.runtime.nodes.has('n1')&&!b.runtime.getData().miroCanvas.connectors[id]&&!b.runtime.getData().miroCanvas.connectors['live-bound'],'Native Delete left dangling connectors');
                  b.runtime.undo(); b.session.refresh();
                  check(JSON.stringify(b.runtime.getData())===JSON.stringify(beforeDelete),'Mixed delete undo lost graph data');
                  b.session.resetTools(); b.select('n1'); b.session.connectorLayer.select(['live-bound']); b.root.focus();
                  const boundCopy=new DataTransfer();b.root.dispatchEvent(new ClipboardEvent('copy',{clipboardData:boundCopy,bubbles:true,cancelable:true}));
                  const boundPayload=JSON.parse(boundCopy.getData('obsidian/canvas')).connectors[0];
                  check(boundPayload.from.type==='node'&&boundPayload.from.nodeId==='n1'&&boundPayload.to.type==='free','Mixed copy did not detach an external anchor');
                  b.session.resetTools();
                  b.session.penPoints=[{x:-500,y:-500},{x:2500,y:-500},{x:2500,y:2500},{x:-500,y:2500}];
                  b.session.selectLassoed();b.session.readInteractionState();
                  check(b.session.selectedIds.includes('n1')&&b.session.selectedIds.includes(id),'Lasso did not catch a mixed selection');
                  b.session.refresh();
                  const frame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                  check(!!frame,'Lassoed nodes and connectors have no common frame');
                  const bounds=frame.getBoundingClientRect(),route=b.session.landingGeometry().geometry.edges[id];
                  for(const point of [route.start,route.end]){
                    const at=b.session.viewportPoint(point);
                    check(at.x>=bounds.left&&at.x<=bounds.right&&at.y>=bounds.top&&at.y<=bounds.bottom,
                      'Lasso frame excludes a selected connector');
                  }
                  const lassoBefore=b.runtime.getData(),lassoSaves=b.getSaves();
                  const move={pointerId:96,clientX:bounds.left+bounds.width/2,clientY:bounds.top+bounds.height/2,bubbles:true,cancelable:true};
                  if(getComputedStyle(frame).pointerEvents!=='auto')throw Error('Lasso frame interior cannot be grabbed');
                  frame.dispatchEvent(new PointerEvent('pointerdown',{...move,button:0}));
                  window.dispatchEvent(new PointerEvent('pointermove',{...move,clientX:move.clientX+40,clientY:move.clientY+20}));
                  window.dispatchEvent(new PointerEvent('pointerup',{...move,clientX:move.clientX+40,clientY:move.clientY+20}));
                  const lassoAfter=b.runtime.getData();
                  check(lassoAfter.nodes.find(n=>n.id==='n1').x===lassoBefore.nodes.find(n=>n.id==='n1').x+40,
                    'Lasso frame did not move its node');
                  check(lassoAfter.miroCanvas.connectors[id].from.x===lassoBefore.miroCanvas.connectors[id].from.x+40,
                    'Lasso frame did not move its connector');
                  check(b.getSaves()===lassoSaves+1,'Lasso frame moved in multiple history steps');
                  check(b.session.selectedIds.includes('n1')&&b.session.selectedIds.includes(id),'Lasso selection disappeared after moving');
                  const nextFrame=b.root.querySelector('.miro-canvas-mixed-selection-frame');
                  check(!!nextFrame,'Lasso frame vanished after moving');
                  const nextBounds=nextFrame.getBoundingClientRect();
                  const again={pointerId:97,clientX:nextBounds.left+nextBounds.width/2,clientY:nextBounds.top+nextBounds.height/2,bubbles:true,cancelable:true};
                  nextFrame.dispatchEvent(new PointerEvent('pointerdown',{...again,button:0}));
                  window.dispatchEvent(new PointerEvent('pointermove',{...again,clientX:again.clientX+30,clientY:again.clientY+10}));
                  window.dispatchEvent(new PointerEvent('pointerup',{...again,clientX:again.clientX+30,clientY:again.clientY+10}));
                  check(b.session.selectedIds.includes('n1')&&b.session.selectedIds.includes(id),'Repeated lasso frame drag lost selection');
                  check(b.runtime.getData().nodes.find(n=>n.id==='n1').x===lassoBefore.nodes.find(n=>n.id==='n1').x+70,
                    'Lasso frame could not move its contents twice');
                  check(b.getSaves()===lassoSaves+2,'Repeated lasso drag did not make a separate history step');
                  b.runtime.undo();b.session.refresh();
                  check(b.runtime.getData().nodes.find(n=>n.id==='n1').x===lassoAfter.nodes.find(n=>n.id==='n1').x,
                    'Repeated lasso drag undo did not restore first move');
                  b.runtime.undo();b.session.refresh();
                  check(JSON.stringify(b.runtime.getData())===JSON.stringify(lassoBefore),'Lasso frame undo lost items');
                  b.dispose();
                }""")
                assert errors == [], errors
                browser.close()
                print("OK: focused clipboard/edge interactions passed (synthetic host)")
                return 0
            assert page.locator(".miro-canvas-dock").count() == 1
            assert page.locator(".miro-canvas-dock__map").count() == 1
            assert page.evaluate("document.querySelector('.miro-canvas-dock').parentElement === miroBrowser.root")
            # The minimap is its own panel (FUT-019), a sibling of the icon
            # row's dock rather than nested inside it, so the "arrange panels"
            # mode can drag the two apart.
            assert page.evaluate("document.querySelector('.miro-canvas-dock__map').parentElement === miroBrowser.root")
            assert page.evaluate("!document.querySelector('.miro-canvas-dock').contains(document.querySelector('.miro-canvas-dock__map'))")
            assert page.evaluate("getComputedStyle(document.querySelector('.miro-canvas-dock')).position") == "absolute"
            assert page.evaluate("getComputedStyle(document.querySelector('.miro-canvas-dock')).right") == "12px"
            assert page.evaluate("getComputedStyle(document.querySelector('.miro-canvas-dock')).bottom") == "36px"
            assert page.evaluate("getComputedStyle(document.querySelector('.miro-canvas-dock__map')).position") == "absolute"
            assert page.evaluate("getComputedStyle(document.querySelector('.miro-canvas-dock__map')).right") == "12px"
            assert page.evaluate("miroBrowser.getSaves()") == 0, "Opening a board saved it"
            assert page.evaluate("miroBrowser.node.nodeEl.getAttribute('data-miro-source-kind')") == "text"
            assert page.evaluate("miroBrowser.fileNode.nodeEl.getAttribute('data-miro-source-kind')") == "media"
            assert page.evaluate("miroBrowser.edge.edgeEl.getAttribute('data-miro-source-kind')") == "connector"
            assert page.evaluate("miroBrowser.edge.edgeEl.getAttribute('data-miro-source-end-cap')") == "arrow"
            assert page.evaluate("getComputedStyle(miroBrowser.content).fontSize") == "19px"
            native_menu = page.locator(".miro-canvas-toolbar__native > .canvas-menu:not(.miro-canvas-toolbar__native-snapshot)")
            native_snapshot = page.locator(".miro-canvas-toolbar__native-snapshot")
            assert native_menu.count() == 1, "Native Canvas menu was not adopted"
            selection_toolbar = page.locator("[data-miro-canvas-toolbar]")
            width_before_pan = selection_toolbar.evaluate("element => element.getBoundingClientRect().width")
            page.evaluate("""() => {
              const event = new PointerEvent('pointerdown', {button:1, pointerId:17, bubbles:true});
              miroBrowser.root.dispatchEvent(event);
              document.querySelector('.miro-canvas-toolbar__native > .canvas-menu:not(.miro-canvas-toolbar__native-snapshot)').replaceChildren();
            }""")
            # The native tools sit under the toolbar's More menu, closed here:
            # the snapshot standing in for them is there, not necessarily shown.
            assert native_snapshot.count() == 1, "Middle-button pan did not preserve the native tool group"
            width_during_pan = selection_toolbar.evaluate("element => element.getBoundingClientRect().width")
            assert abs(width_during_pan - width_before_pan) < 0.5, "Selection toolbar changed width during middle-button pan"
            page.evaluate("document.dispatchEvent(new PointerEvent('pointerup', {button:1, pointerId:17, bubbles:true}))")
            assert native_snapshot.count() == 0 or not native_snapshot.is_visible(), "Pan snapshot stayed after middle-button release"
            page.evaluate("miroBrowser.session.toggleAttachmentNames()")
            assert page.evaluate("getComputedStyle(miroBrowser.fileLabel).display") == "none", "Native attachment title stayed visible"
            page.evaluate("miroBrowser.session.toggleAttachmentNames()")
            assert page.evaluate("getComputedStyle(miroBrowser.fileLabel).display") != "none"
            assert page.evaluate("miroBrowser.fileNode.nodeEl.querySelectorAll('.miro-canvas-attachment-label').length") == 0, "Duplicate attachment label"
            theme_before = page.evaluate("miroBrowser.runtime.data.miroCanvas.settings.displayTheme")
            saves_before_theme = page.evaluate("miroBrowser.getSaves()")
            page.evaluate("miroBrowser.session.setTheme('dark')")
            assert page.evaluate("miroBrowser.runtime.data.miroCanvas.settings.displayTheme") == "dark"
            assert page.evaluate("miroBrowser.getSaves()") == saves_before_theme + 1
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh()")
            assert page.evaluate("miroBrowser.runtime.data.miroCanvas.settings.displayTheme") == theme_before
            page.evaluate("miroBrowser.runtime.redo(); miroBrowser.session.refresh()")
            page.evaluate("miroBrowser.session.toggleReviewMode()")
            assert page.evaluate("miroBrowser.runtime.readonly"), "Review mode did not guard native editor"
            page.evaluate("miroBrowser.session.toggleReviewMode()")
            assert not page.evaluate("miroBrowser.runtime.readonly"), "Review mode did not unlock"
            # Typography and colors now live in the floating selection toolbar.
            assert page.locator(".miro-canvas-toolbar:not(.miro-canvas-tools):not(.miro-board-connector-tools)").count() == 1
            assert not page.evaluate("document.querySelector('.miro-canvas-toolbar').hidden"), (
                "Selection toolbar stayed hidden for a selected node"
            )
            size = page.get_by_label("Font size", exact=True)
            size.fill("28")
            size.dispatch_event("change")
            assert page.evaluate("miroBrowser.runtime.data.miroCanvas.localOverrides.n1.typography.fontSize") == 28
            assert page.evaluate("getComputedStyle(miroBrowser.content).fontSize") == "28px"
            page.get_by_label("Fill color", exact=True).click()
            color = page.get_by_label("Custom fill color", exact=True)
            color.fill("#abcdef")
            color.dispatch_event("change")
            assert page.evaluate("getComputedStyle(miroBrowser.node.nodeEl).backgroundColor") == "rgb(171, 205, 239)"
            page.evaluate("miroBrowser.runtime.selection.clear(); miroBrowser.session.refresh()")
            assert page.evaluate("document.querySelector('.miro-canvas-toolbar').hidden"), (
                "Selection toolbar stayed visible after the selection was cleared"
            )
            page.evaluate("miroBrowser.runtime.selection.add(miroBrowser.node); miroBrowser.session.refresh()")
            page.evaluate("miroBrowser.session.lockSelection()")
            assert page.evaluate("miroBrowser.runtime.data.miroCanvas.localOverrides.n1.locked")
            assert page.evaluate("""() => {
              const event = new KeyboardEvent('keydown', {key:'Delete', bubbles:true, cancelable:true});
              miroBrowser.node.nodeEl.dispatchEvent(event); return event.defaultPrevented;
            }"""), "Locked node Delete was not blocked"
            assert not page.evaluate("""() => {
              const event = new KeyboardEvent('keydown', {key:'c', ctrlKey:true, bubbles:true, cancelable:true});
              miroBrowser.node.nodeEl.dispatchEvent(event); return event.defaultPrevented;
            }"""), "Lock incorrectly blocked copy"
            for key in ["z", "y", "f", "a"]:
                assert not page.evaluate("""key => {
                  const event = new KeyboardEvent('keydown', {key, ctrlKey:true, bubbles:true, cancelable:true});
                  miroBrowser.node.nodeEl.dispatchEvent(event); return event.defaultPrevented;
                }""", key), f"Lock incorrectly blocked Ctrl+{key}"
            page.evaluate("miroBrowser.session.unlockSelection()")
            edge_count = page.evaluate("miroBrowser.runtime.edges.size")
            assert page.locator(".miro-canvas-handle--connect").count() == 4
            handle_box = page.locator('.miro-canvas-handle--right[data-handle-position="0.5"]').bounding_box()
            target_box = page.evaluate("() => { const r = miroBrowser.fileNode.nodeEl.getBoundingClientRect(); return {x:r.x,y:r.y}; }")
            assert handle_box is not None
            page.mouse.move(handle_box["x"] + handle_box["width"] / 2, handle_box["y"] + handle_box["height"] / 2)
            page.mouse.down()
            page.mouse.move(target_box["x"] + 20, target_box["y"] + 20)
            page.mouse.up()
            assert page.evaluate("miroBrowser.runtime.edges.size") == edge_count + 1
            precise = page.evaluate("""() => {
              const edge = [...miroBrowser.runtime.edges.values()].at(-1).getData();
              return miroBrowser.runtime.data.miroCanvas.localOverrides[edge.id].connectorAnchors;
            }""")
            # The gesture starts at the explicitly selected right-side midpoint.
            assert precise["from"]["v"] == 0.5 and precise["to"]["v"] != 0.5
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh()")
            page.evaluate("miroBrowser.node.nodeEl.style.left = '65px'; miroBrowser.runtime.data = miroBrowser.runtime.getData(); miroBrowser.runtime.requestSave(true); miroBrowser.session.refresh()")
            assert page.evaluate("miroBrowser.node.nodeEl.style.left") == "65px", "Appearance clobbered native geometry"
            page.evaluate("miroBrowser.session.navigate('zoom-in')")
            assert page.evaluate("miroBrowser.runtime.tZoom") > 0
            assert page.evaluate("miroBrowser.sourceUnchanged()"), "miroSource changed"

            assert page.evaluate("miroBrowser.mountM2()"), "M2 tools did not mount"
            m2 = page.locator(".miro-canvas-m2-tools")
            comments = m2.locator(".miro-canvas-comments-panel")
            assert m2.count() == 1
            assert comments.count() == 1
            assert comments.locator(".miro-canvas-comments-panel__composer").count() == 1

            history_before_geometry = page.evaluate("miroBrowser.getHistoryLength()")
            m2.get_by_label("Rotation degrees", exact=True).fill("30")
            m2.get_by_role("button", name="Apply rotation", exact=True).click()
            assert page.evaluate("miroBrowser.runtime.data.miroCanvas.localOverrides.n1.rotation") == 30
            assert page.evaluate("miroBrowser.node.nodeEl.style.rotate") == ""
            assert page.evaluate("miroBrowser.node.nodeEl.style.transform") == "rotate(30deg)"
            assert page.evaluate("miroBrowser.getHistoryLength()") == history_before_geometry + 1
            page.evaluate("miroBrowser.node.nodeEl.style.transform = 'translate(20px, 0px)'; miroBrowser.session.refresh()")
            for _ in range(5):
                page.evaluate("miroBrowser.runtime.selection.clear(); miroBrowser.session.refresh(); miroBrowser.runtime.selection.add(miroBrowser.node); miroBrowser.session.refresh()")
                assert page.evaluate("miroBrowser.node.nodeEl.style.rotate") == ""
                assert page.evaluate("miroBrowser.node.nodeEl.style.transform") == "translate(20px, 0px) rotate(30deg)"
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.node.nodeEl.style.rotate") == ""
            page.evaluate("miroBrowser.runtime.redo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.node.nodeEl.style.transform").endswith("rotate(30deg)")
            m2.get_by_role("button", name="Bring to front", exact=True).click()
            # n1 is the only card selected, so it becomes the last card in node
            # order; there is no frame in this fixture, so it is simply last.
            assert page.evaluate("miroBrowser.runtime.data.nodes.at(-1).id") == "n1"
            # An explicit but empty zOrder has no card slot to rewrite, so it
            # stays empty; only a non-empty zOrder is checked for n1's slot.
            z_order = page.evaluate("(miroBrowser.runtime.data.miroCanvas || {}).zOrder")
            if z_order:
                assert z_order[-1] == "n1"
            assert page.evaluate("miroBrowser.sourceUnchanged()")
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.node.nodeEl.style.rotate") == ""

            node_count = page.evaluate("miroBrowser.runtime.nodes.size")
            m2.get_by_label("Shape kind", exact=True).select_option("rhombus")
            m2.get_by_label("Shape text", exact=True).fill("Local diamond")
            m2.get_by_label("Shape X", exact=True).fill("700")
            m2.get_by_role("button", name="Create shape", exact=True).click()
            assert page.evaluate("miroBrowser.runtime.nodes.size") == node_count + 1
            shape_id = page.evaluate("miroBrowser.runtime.data.nodes.find(n => n.text === 'Local diamond').id")
            assert page.evaluate("id => miroBrowser.runtime.data.miroCanvas.localOverrides[id].shape", shape_id)
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.runtime.nodes.size") == node_count
            page.evaluate("miroBrowser.runtime.redo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.runtime.nodes.size") == node_count + 1
            for guard in ["review", "native-readonly"]:
                page.evaluate("guard => { if (guard === 'review') miroBrowser.session.toggleReviewMode(); else miroBrowser.runtime.readonly = true; }", guard)
                saves = page.evaluate("miroBrowser.getSaves()")
                m2.get_by_role("button", name="Create shape", exact=True).click()
                assert page.evaluate("miroBrowser.runtime.nodes.size") == node_count + 1
                assert page.evaluate("miroBrowser.getSaves()") == saves
                page.evaluate("guard => { if (guard === 'review') miroBrowser.session.toggleReviewMode(); else miroBrowser.runtime.readonly = false; }", guard)

            comments.get_by_label("New comment", exact=True).fill("Synthetic M2 comment")
            comments.get_by_role("button", name="Add comment", exact=True).click()
            card = comments.locator("article[data-comment-id]").filter(has_text="Synthetic M2 comment").first
            assert card.count() == 1, "M2 add comment did not render a local thread"
            thread_id = card.get_attribute("data-comment-id")
            assert thread_id
            page.evaluate("miroBrowser.session.refresh()")
            marker = page.locator(f'.miro-canvas-comment-marker[data-comment-id="{thread_id}"]')
            assert marker.count() == 1, "Comment was saved without its Canvas marker"
            assert card.locator('[data-comment-time="created"]').count() == 1, "Comment creation time is missing"
            card.locator(".miro-canvas-comment-card__edit-toggle").click()
            card.get_by_label(f"Edit comment {thread_id}", exact=True).fill("Edited synthetic M2 comment")
            page.wait_for_timeout(650)
            assert card.get_by_label(f"Edit comment {thread_id}", exact=True).evaluate("element => document.activeElement === element")
            card.get_by_role("button", name="Save edit", exact=True).click()
            card = comments.locator(f'article[data-comment-id="{thread_id}"]')
            assert "Edited synthetic M2 comment" in card.inner_text()
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert card.get_by_label(f"Edit comment {thread_id}", exact=True).input_value() == "Synthetic M2 comment"
            page.evaluate("miroBrowser.runtime.redo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            card.get_by_label(f"Reply to {thread_id}", exact=True).fill("Synthetic reply")
            page.wait_for_timeout(650)
            assert card.get_by_label(f"Reply to {thread_id}", exact=True).evaluate("element => document.activeElement === element")
            card.get_by_role("button", name="Reply", exact=True).click()
            assert "Synthetic reply" in card.locator('[data-comment-region="replies"]').inner_text()
            assert card.locator('[data-comment-region="replies"] [data-comment-time="created"]').count() == 1
            assert card.get_by_label(f"Reply to {thread_id}", exact=True).input_value() == ""
            card.get_by_role("button", name="Resolve", exact=True).click()
            assert card.get_by_text("Resolved", exact=True).count() == 1

            anchor_x = m2.get_by_label("Anchor X, U or T", exact=True)
            anchor_y = m2.get_by_label("Anchor Y or V", exact=True)

            anchor_x.fill("123")
            anchor_y.fill("456")
            comments.get_by_role("button", name="Pick coordinates", exact=True).click()
            comments.get_by_label("New comment", exact=True).fill("Free anchor navigation")
            comments.get_by_role("button", name="Add comment", exact=True).click()
            free_card = comments.locator("article[data-comment-id]").filter(has_text="Free anchor navigation").first
            free_card.locator('[data-comment-action="select-target"]').click()
            assert page.evaluate("Math.abs(miroBrowser.runtime.tx - 123) < 0.001 && Math.abs(miroBrowser.runtime.ty - 456) < 0.001")

            page.evaluate("miroBrowser.select('n1')")
            anchor_x.fill("0.25")
            anchor_y.fill("0.5")
            comments.get_by_role("button", name="Use selection", exact=True).click()
            comments.get_by_label("New comment", exact=True).fill("Node anchor navigation")
            comments.get_by_role("button", name="Add comment", exact=True).click()
            node_card = comments.locator("article[data-comment-id]").filter(has_text="Node anchor navigation").first
            node_card.locator('[data-comment-action="select-target"]').click()
            assert page.evaluate("Math.abs(miroBrowser.runtime.tx - 140) < 0.001 && Math.abs(miroBrowser.runtime.ty - 200) < 0.001")

            page.evaluate("miroBrowser.select('image')")
            anchor_x.fill("0.2")
            anchor_y.fill("0.3")
            comments.get_by_role("button", name="Use selection", exact=True).click()
            comments.get_by_label("New comment", exact=True).fill("Image anchor navigation")
            comments.get_by_role("button", name="Add comment", exact=True).click()
            image_card = comments.locator("article[data-comment-id]").filter(has_text="Image anchor navigation").first
            image_card.locator('[data-comment-action="select-target"]').click()
            assert page.evaluate("Math.abs(miroBrowser.runtime.tx - 450) < 0.001 && Math.abs(miroBrowser.runtime.ty - 410) < 0.001")

            page.evaluate("miroBrowser.select('e1')")
            anchor_x.fill("0.5")
            anchor_y.fill("0.5")
            comments.get_by_role("button", name="Use selection", exact=True).click()
            comments.get_by_label("New comment", exact=True).fill("Edge anchor navigation")
            comments.get_by_role("button", name="Add comment", exact=True).click()
            edge_card = comments.locator("article[data-comment-id]").filter(has_text="Edge anchor navigation").first
            edge_card.locator('[data-comment-action="select-target"]').click()
            assert page.evaluate("Math.abs(miroBrowser.runtime.tx - 382.5) < 0.001 && Math.abs(miroBrowser.runtime.ty - 200) < 0.001")

            page.evaluate("miroBrowser.select('n1')")
            comments.get_by_role("button", name="Use selection", exact=True).click()
            m2.get_by_label("Anchor target", exact=True).select_option("image")
            anchor_x.fill("0.8")
            anchor_y.fill("0.25")
            m2.get_by_label("Connector", exact=True).select_option("e1")
            m2.get_by_label("Connector end", exact=True).select_option("from")
            m2.get_by_role("button", name="Set connector endpoint", exact=True).click()
            assert page.evaluate("miroBrowser.runtime.data.edges.find(e => e.id === 'e1').fromNode") == "image"
            assert page.evaluate("miroBrowser.runtime.data.miroCanvas.localOverrides.e1.connectorAnchors.from") == {"type": "image", "nodeId": "image", "u": 0.8, "v": 0.25}
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.runtime.data.edges.find(e => e.id === 'e1').fromNode") == "n1"
            page.evaluate("miroBrowser.runtime.redo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.runtime.data.edges.find(e => e.id === 'e1').fromNode") == "image"
            page.evaluate("miroBrowser.select('image'); miroBrowser.session.lockSelection()")
            saves = page.evaluate("miroBrowser.getSaves()")
            m2.get_by_label("Anchor target", exact=True).select_option("n1")
            m2.get_by_role("button", name="Set connector endpoint", exact=True).click()
            assert page.evaluate("miroBrowser.getSaves()") == saves
            page.evaluate("miroBrowser.session.unlockSelection()")

            documents = m2.locator(".miro-canvas-document-controls")
            assert documents.count() == 1, "Selected PDF did not mount native document controls"
            documents.get_by_label("PDF page", exact=True).fill("3")
            documents.get_by_label("PDF fit", exact=True).select_option("width")
            documents.get_by_role("button", name="Open page", exact=True).click()
            page.wait_for_function("miroBrowser.openCalls.length === 1")
            assert page.evaluate("miroBrowser.openCalls[0]") == {
                "path": "attachments/Spec.pdf", "title": "Spec.pdf", "kind": "pdf", "page": 3, "fit": "width",
                "subpath": "#page=3",
            }
            documents.get_by_role("button", name="Next page", exact=True).click()
            page.wait_for_function("miroBrowser.openCalls.length === 2")
            assert page.evaluate("miroBrowser.openCalls[1].page") == 4

            history_before = page.evaluate("miroBrowser.getHistoryLength()")
            page.evaluate("""() => {
              const draft = miroBrowser.runtime.getData();
              draft.nodes.push({id:'history-node', type:'text', text:'history', x:700, y:300, width:100, height:80, unknownNode:{preserved:'history'}});
              draft.edges.push({id:'history-edge', fromNode:'n1', toNode:'history-node', unknownEdge:{preserved:'history'}});
              miroBrowser.runtime.importData(draft);
              miroBrowser.runtime.requestSave(true);
            }""")
            assert page.evaluate("miroBrowser.runtime.nodes.has('history-node') && miroBrowser.runtime.edges.has('history-edge')")
            assert page.evaluate("miroBrowser.getHistoryLength()") == history_before + 1
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert not page.evaluate("miroBrowser.runtime.nodes.has('history-node') || miroBrowser.runtime.edges.has('history-edge')")
            page.evaluate("miroBrowser.runtime.redo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.runtime.nodes.has('history-node') && miroBrowser.runtime.edges.has('history-edge')")
            assert page.evaluate("miroBrowser.runtime.getData().nodes.find(n => n.id === 'history-node').unknownNode.preserved") == "history"
            assert page.evaluate("miroBrowser.runtime.getData().edges.find(e => e.id === 'history-edge').unknownEdge.preserved") == "history"
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("miroBrowser.unknownsPreserved()"), "Unknown root/node/edge or miroSource fields changed"
            page.evaluate("miroBrowser.session.toggleAttachmentNames()")
            assert page.evaluate("getComputedStyle(miroBrowser.fileLabel).display") == "none"
            page.evaluate("miroBrowser.runtime.undo(); miroBrowser.session.refresh(); miroBrowser.m2.refresh()")
            assert page.evaluate("getComputedStyle(miroBrowser.fileLabel).display") != "none"

            page.evaluate("miroBrowser.runtime.selection.clear()")
            page.wait_for_function("miroBrowser.session.snapshot.selectedIds.length === 0")
            assert page.locator('.miro-canvas-dock[data-miro-canvas-has-selection="false"]').count() == 1
            assert not page.locator(".miro-canvas-panel__selection-only").first.is_visible()

            # Search on the board: Ctrl+F on the focused board opens the bar,
            # typing finds the diamond and Diagram.png, Enter moves the board
            # to the next one, Escape closes it and gives the board its keys back.
            camera_before_search = page.evaluate("({x: miroBrowser.runtime.tx, y: miroBrowser.runtime.ty, zoom: miroBrowser.runtime.tZoom})")
            saves_before_search = page.evaluate("miroBrowser.getSaves()")
            page.evaluate("miroBrowser.root.focus()")
            page.keyboard.press("Control+f")
            search_input = page.locator(".miro-canvas-search input")
            assert search_input.is_visible(), "Ctrl+F on the board did not open the search"
            assert page.evaluate("document.activeElement === document.querySelector('.miro-canvas-search input')")
            search_input.press_sequentially("DIA")
            page.wait_for_function("document.querySelector('.miro-canvas-search__count').textContent === '1 / 2'")
            first_camera = page.evaluate("({x: miroBrowser.runtime.tx, y: miroBrowser.runtime.ty})")
            search_input.press("Enter")
            assert page.locator(".miro-canvas-search__count").text_content() == "2 / 2"
            assert page.evaluate("miroBrowser.session.searchState().key") in ("node:image", "node:miro-canvas-node-2")
            assert page.evaluate("({x: miroBrowser.runtime.tx, y: miroBrowser.runtime.ty})") != first_camera, "Enter did not move the board to the next match"
            assert page.locator(".miro-canvas-search-hit").is_visible(), "The match shown has no outline"
            assert page.evaluate("getComputedStyle(document.querySelector('.miro-canvas-search-hit')).pointerEvents") == "none"
            assert page.evaluate("getComputedStyle(document.querySelector('.miro-canvas-search')).top") == "12px"
            search_input.press("Escape")
            assert not page.locator(".miro-canvas-search").is_visible(), "Escape did not close the search"
            assert not page.locator(".miro-canvas-search-hit").is_visible()
            assert page.evaluate("document.activeElement === miroBrowser.root"), "Closing the search did not return focus to the board"
            assert page.evaluate("miroBrowser.getSaves()") == saves_before_search, "Searching the board saved it"
            page.evaluate("c => { miroBrowser.runtime.setViewport(c.x, c.y, c.zoom); miroBrowser.session.refresh(); }", camera_before_search)

            # The minimap follows the board's choice, else the settings, on every
            # screen: a narrow one draws it smaller and keeps it clear of the
            # dock and the tool bar.
            for width, canvas_width in ((800, 160), (412, 120)):
                page.set_viewport_size({"width": width, "height": 915})
                page.wait_for_timeout(200)
                layout = page.evaluate("""() => {
                  const box = (selector) => {
                    const element = document.querySelector(selector);
                    if (element === null) return null;
                    const r = element.getBoundingClientRect();
                    return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width};
                  };
                  const map = document.querySelector('.miro-canvas-dock__map');
                  return {
                    shown: getComputedStyle(map).display !== 'none' && !map.hidden,
                    map: box('.miro-canvas-dock__map'), canvas: box('.miro-canvas-panel__minimap-canvas'),
                    dock: box('.miro-canvas-dock'), tools: box('.miro-canvas-toolbar.miro-canvas-tools'),
                  };
                }""")
                assert layout["shown"], f"The minimap is hidden at {width}px although the settings show it"
                assert layout["canvas"]["width"] == canvas_width, layout
                for other in ("dock", "tools"):
                    a, b = layout["map"], layout[other]
                    if b is None:
                        continue
                    overlap = a["left"] < b["right"] and b["left"] < a["right"] and a["top"] < b["bottom"] and b["top"] < a["bottom"]
                    assert not overlap, f"The minimap covers the {other} at {width}px: {layout}"
            page.set_viewport_size({"width": 1600, "height": 900})
            page.wait_for_timeout(200)

            output = REPO / "tools/obsidian_oracle/.out/m1-browser.png"
            output.parent.mkdir(parents=True, exist_ok=True)
            m2.evaluate("element => element.scrollTop = 0")
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(output))
            left_before_dispose = page.evaluate("miroBrowser.node.nodeEl.style.left")
            page.evaluate("miroBrowser.dispose()")
            assert page.locator(".miro-canvas-dock").count() == 0
            assert page.locator(".miro-canvas-dock__map").count() == 0
            assert page.locator(".miro-canvas-m2-tools").count() == 0
            assert not page.evaluate("miroBrowser.runtime.readonly")
            assert page.evaluate("miroBrowser.node.nodeEl.style.left") == left_before_dispose, "Teardown clobbered native geometry"
            assert page.evaluate("miroBrowser.node.nodeEl.style.backgroundColor") == "", "Teardown left appearance styles"
            assert page.evaluate("miroBrowser.node.nodeEl.getAttribute('data-miro-source-kind')") is None
            assert page.evaluate("miroBrowser.edge.edgeEl.getAttribute('data-miro-source-kind')") is None
            assert page.evaluate("miroBrowser.checkPreexistingReadonly()") == {"preserved": True, "saved": False}
            assert errors == [], errors
            browser.close()
    print("OK: plugin browser DOM smoke passed (synthetic host; real Obsidian gate remains separate)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
