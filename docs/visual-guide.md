# Наглядное руководство / Visual guide

Проверено 3 октября 2026 года в отдельном Obsidian 1.13.7 на Windows,
а также в тестовых хранилищах Android: Samsung SM-X736B (Obsidian 1.13.8)
и Galaxy A33 / SM-A336E (Obsidian 1.12.7). Личные хранилища не менялись.

Последние исправления панелей и оформление выделенного текста проверены
в Obsidian на ПК и планшете. Добавление файла с устройства проверено через
системное окно Android на планшете и смартфоне: проверены изображение и PDF.
На Galaxy A33 повторно проверены сворачивание и перенос панелей, инструменты
из «+», скрытие кнопок и оформление выделенного слова с открытой клавиатурой.
Телефонные записи настройки панелей обновлены для текущего вида меню.

## Что показано

В [русском README](../README.ru.md) и [английском README](../README.md)
размещены 14 примеров на компьютере и шесть на телефоне и планшете,
по одной записи для каждого языка. Сценарии находятся
в [`tools/obsidian_cdp/scenarios`](../tools/obsidian_cdp/scenarios).
Все 40 GIF вместе занимают около 12 МиБ; каждый файл меньше 1 МБ.

| Запись | Что видно в ролике |
| --- | --- |
| `sticky-with-note` | Создание стикера рядом с настоящей заметкой и стрелка между ними |
| `insert-note` | Выбор существующей заметки из хранилища и добавление на доску |
| `obsidian-links` | Ввод ссылки и встраивания, содержимое заметки и переход к оригиналу |
| `nested-canvas` | Превью другого Canvas и открытие самой доски |
| `create-shape` | Выбор ромба, создание перетаскиванием и ввод вопроса |
| `frame-group` | Перенос фрейма за название вместе с двумя задачами |
| `select-together` | Выделение двух карточек рамкой и перенос вместе со связью |
| `format-card` | Смена шрифта и заливки карточки, жирное начертание одного выделенного слова |
| `move-connected` | Стрелка следует за карточкой, отмена возвращает их на место |
| `draw-and-erase` | Красный штрих пером и его удаление ластиком |
| `comment-thread` | Вопрос, ответ и отметка «решено» |
| `board-search` | Поиск и переход к карточке за пределами текущего вида |
| `export-pages` | Книжная ориентация, страницы по фреймам, PDF/PPTX и открытие PDF |
| `arrange-panels` | Перенос панели, поворот, линия вставки и перенос свёрнутой панели после удержания |
| `phone-move`, `tablet-move` | Касание карточки и перенос вместе со стрелкой |
| `phone-navigation`, `tablet-navigation` | Перемещение доски и увеличение двумя пальцами |
| `phone-layout`, `tablet-layout` | Поворот, перенос панелей, линия вставки, сворачивание и перенос после удержания; также перенос инструмента из «+» |

## Насколько понятно

Каждый ролик показывает одну небольшую задачу. Курсор плавно подходит к
кнопке, перед нажатием есть короткая пауза, после результата — время для
чтения. Подписи говорят о действии и результате обычными словами.
Русские и английские записи используют один сценарий, но язык интерфейса,
текст заметок и подписи соответствуют своему README.

В начале README открыта только запись со стикером и заметкой. Остальные
примеры раскрываются возле описания функции. Это позволяет читать страницу
без множества одновременно видимых анимаций. Текстовые инструкции остаются
понятны и без просмотра GIF.

Записи с компьютера имеют размер 960 × 600. Записи с телефона — 384 × 854,
с планшета — 600 × 960, а обновлённый пример настройки панелей — 540 × 864; сохранены пропорции экрана. Основная часть длится около 8–15 секунд;
обсуждение и экспорт длиннее, потому что надо успеть прочитать сообщения и
увидеть готовый файл. На узком экране надписи внутри интерфейса мелкие:
для подробного просмотра лучше открыть GIF в полном размере. В README
добавлена такая подсказка. Для просмотра на телефоне добавлены отдельные вертикальные записи
с более крупными карточками.

Проверка — просмотр начала, середины и конца каждого ролика, а также
проверки результатов внутри сценариев. Проверяются созданные карточки,
связи, сохранённое оформление, переходы к файлам, перемещения, отмена,
поиск и решение комментария. PDF и PPTX созданы настоящим экспортом:
отдельно проверены две страницы PDF и два слайда PPTX. PowerPoint как
приложение в ролике не открывается: показано сохранение и затем PDF.
Это оценка автора записей; проверка с новыми пользователями ещё не проведена.
В локальном просмотре Markdown также проверены раскрытие всех примеров и
ширина страницы при окне 390 px. Это не проверка мобильного приложения
Obsidian и не снимок страницы GitHub.

## Что улучшено после просмотра

- После проверки на планшете список убранных инструментов стал следовать за
  панелью, захват и поворот разнесены, добавлена линия вставки. Записи настройки
  на ПК и планшете обновлены; проверены отсутствие перекрытия кнопок и порядок после отпускания.

- Кнопка сворачивания получила отдельное место в основном ряду инструментов.
  Открытое меню навигации не перекрывается миникартой. При повторных касаниях
  на планшете и смартфоне кнопки остаются в одной точке после раскрытия и сворачивания.

- Увеличены подписи; убран случайный первый кадр от предыдущей доски.
- На телефоне оставлены семь частых инструментов в одной строке, навигация
  вынесена сбоку; на планшете инструменты стоят столбцом.
- Исправлена палитра вертикальных GIF: белые подписи больше не получают
  жёлтый или зелёный оттенок от карточек.
- Исправлен выход кнопки «Готово» за край телефона в русском режиме настройки
  панелей. Проверены её доступность и закрытие режима настоящим касанием.
- Два README сокращены примерно вдвое: сначала знакомство и обычные задачи,
  затем настройки, устройства и экспорт. Техническая справка, подробности
  импорта и работа над репозиторием вынесены в отдельные документы.
- Убраны повторяющиеся сравнения с Miro и обещания полной совместимости.
  Связь с Obsidian объясняется через заметки, ссылки и общий файл; ограничения
  оформления без плагина и экспорта указаны рядом с соответствующими действиями.
- Курсор после действия уходит на пустое место, чтобы подсказка миникарты
  не закрывала результат.
- Ромб создаётся крупнее, чтобы вопрос внутри не разбивался на мелкие строки.
- Панель после переноса не перекрывает текст демонстрационной карточки.
- Вложенный Canvas показан вместе с переходом к оригиналу. В README
  поясняется, что в его небольшом превью нет текста карточек.
- Добавлены примеры `[[ссылок]]` и `![[встраиваний]]`, объяснение одного
  общего файла заметки и порядок открытия ссылки из карточки.
- Исправлена ошибка экспорта: отдельно расположенная миникарта попадала
  в страницы. Подписи и курсор записи теперь тоже исключаются из снимка.
- Для высоких фреймов выбрана книжная ориентация, чтобы в страницу не
  попадал соседний фрейм и целиком помещался заголовок.
- В финале экспорта PDF подогнан по высоте окна: видна вся первая страница.
  Под роликом доступны настоящие PDF и PPTX, чтобы проверить результат.
- Возле экспорта поясняется, что страницы и слайды — изображения доски,
  а не набор отдельно редактируемых фигур и текстовых блоков.

## Что ещё не показано

Задача `FUT-012` остаётся открытой: эта серия не заменяет весь список функций
и настроек. Четыре прежние записи (`tool-bar`, `text`, `shapes`, `frames`)
сохранены как черновики и не используются в новых разделах README.

Следующими полезнее всего записать:

1. Поворот, изменение размера, копирование между досками, слои и блокировку.
2. Виды стрелок, свободные концы, изгибы и подписи; маркер, умное рисование
   и частичный ластик.
3. Создание и название фрейма; код, таблицы, картинки и другие файлы;
   ссылки на заголовок и блок заметки.
4. Масштаб и переход через миникарту, привязки, темы и выбор своих инструментов.
5. Импорт настоящей доски Miro, выключение плагина и сохранность обычного Canvas.
6. Шрифты, первый запуск и отдельные настройки из списка в README.

Касания автоматизированы через Android, два пальца — через CDP WebView.
Проверяются реальные изменения доски на физических устройствах, но это
не проверка нажима настоящего пера и касания ладонью. Записи macOS, Linux
и iOS пока не сделаны.
Новая доска знакомства включена в сборку на русском и английском. Её отдельная
запись для руководства пока не сделана.

## English review

Fourteen desktop demonstrations and six phone/tablet demonstrations are
embedded in both READMEs. The table
above lists their scenario names and exact coverage. They show real input
in isolated Obsidian 1.13.7 on Windows, with smooth pointer motion, gradual
typing, readable captions and a pause to inspect the result. One opening
GIF shows Miro-style sticky notes beside an actual Obsidian note. Other
recordings expand beside the relevant feature descriptions.
The 40 GIFs total about 12 MiB; each file is under 1 MB.

Desktop GIFs are 960 × 600; phone GIFs are 384 × 854 and tablet GIFs
600 × 960, preserving the portrait screen proportions. Most last roughly 8–15 seconds; comments and export
take longer to leave time for reading and the completed output. Small
controls need full-size viewing on a narrow screen. Start, middle and end
frames were reviewed, and scenarios assert their actual results. This is
an author review, not a usability study with first-time users.
All example sections also opened correctly in a local Markdown preview;
its 390 px layout fitted without horizontal overflow. That preview is not
a GitHub screenshot or a mobile Obsidian test.

Review led to larger captions, removal of stale opening frames and minimap
hover hints, a larger decision shape, better panel placement, and a clearer
Canvas embed demonstration that also opens the original board. Documentation
now explains Obsidian links and embeds, opening a link from a selected card,
and sharing the original note file. It also explains that PDF pages and
PowerPoint slides contain images of the board rather than editable card
objects. Portrait pages suit the tall sample frames without including the
neighbouring frame or clipping the title.
The final PDF view fits the page height, and both actual output files are
linked under the demonstration.

Actual PDF and PPTX exports were checked for two pages and two slides.
The GIF shows the saved PDF; it does not show PowerPoint running. Review
also caught and fixed the separately placed minimap leaking into export.
The recording overlay is excluded from export captures too.

`FUT-012` remains open. Rotation, resizing, cross-board copying, layers,
locking, advanced connectors, drawing variants, more file types, heading
and block links, navigation, snapping, themes, imports, plugin-off behaviour,
font packs, onboarding and individual settings still need recordings.
The older four recordings remain drafts. Android recordings now show
automated touchscreen drag, two-finger zoom and panel arrangement on real
Samsung phone/tablet devices in separate test vaults. Phone tools use one
short row; tablet tools use a side column. Review caught and fixed the
Russian Done button extending off a narrow screen and tinted white GIF labels.
Both READMEs were shortened around common tasks; technical reference and
contributor instructions moved to separate documents. Physical stylus
pressure, palm behaviour, macOS/Linux and iOS remain unverified. The revised welcome board ships in both languages; its tour was added for 0.2.1.

## Reproduce the review

After recording both languages:

```powershell
python tools/obsidian_cdp/audit_guide.py
node --test tools/obsidian_cdp/tests/cdp-key-events.test.mjs
python -m pytest -q tools/obsidian_cdp/tests tools/obsidian_oracle/tests
```

The audit checks both README references, scenario files, GIF dimensions,
looping, duration and the 4 MiB limit. It writes timing/size measurements
and contact sheets to `tools/obsidian_cdp/.out/guide-review/` for manual
inspection. This does not automatically judge readability.

The export scenario predetermines only the operating system's save location,
inside the isolated vault. Capture, PDF/PPTX encoding, writing and PDF viewing
use the actual plugin and Obsidian. The save-dialog function is restored
in cleanup, including after a failed scenario.


Обновление планшетного примера: кнопка сворачивания встроена в ряд меню,
свёрнутые панели квадратные. В обе записи добавлен перенос блока кода из «+»
в основной ряд; длительность — около 28 секунд. На планшете отдельно
проверены перенос штатной карточки Obsidian и выключение кнопки сворачивания
через настройки. В обычном меню после выключения не остаётся пустого места.

Проверка смартфона после подключения: обновлены русская и английская записи
настройки панелей, перемещения карточки и навигации. При оформлении выделенного слова обнаружено перекрытие
меню начертания системной панелью Android; меню перенесены выше панели
карточки. Проверены все четыре начертания, шрифт и размер, сохранение этих
изменений после выхода из редактора, выбор файла из
хранилища Obsidian и добавление изображения и PDF с устройства.

Повторная проверка кнопки сворачивания: убран остающийся после касания фон
наведения Android. Значок выровнен по центру, кнопка отделена от инструментов
линией. Диагональные стрелки заменены значком сворачивания панели. Обновлены
четыре записи настройки меню; на обоих устройствах проверены удержание,
перенос открытого и свёрнутого меню, поворот и повторное раскрытие.


0.2.1 review (2026-10-04): added paired `tablet-drawing`, `minimap-size` and
`welcome-board` recordings. The drawing example enables both switches through
the real Android settings, sends changing pen pressure through CDP, then draws
with touchscreen input, zooms with two fingers and double taps without dots.
It checks saved widths and the final item count. Physical pressure/palm contact
remain unverified. The minimap recording exposed responsive CSS overriding
stored dimensions; it now checks saved size on the actual tablet. Phone and
tablet panel layout recordings show grouped Plus/fold controls. All mobile
writes remain inside MiroCanvasTest. The welcome tour uses isolated desktop
vaults and shows drawing and panel instructions in both languages.

Final gates: TypeScript check, 1,684 Vitest tests (one skipped), all three
browser smoke modes, pinned schema check, plugin/MCP builds, 63 Python tests
and the recording helpers passed. Audit covers 46 GIFs, under 4 MiB each.
An isolated Obsidian 1.13.7 check at 50% zoom inspected the pressure preview
before release, saved widths [10.2, 19.2, 11.1], and reopened the file with
the same widths. Android runs also found and fixed the spare-tools tray
covering the Russian Plus menu. The old M0 vault installer still pins 0.1.0;
release interaction checks use the isolated CDP harness instead.
