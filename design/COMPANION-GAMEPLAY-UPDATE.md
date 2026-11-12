# Лист персонажа: игровые действия, манекен и броня

Проверено 12 ноября 2026 года. Ветка `feat/sheet-gameplay-and-armour`, исходная версия — `master` (`671a191`). Изменения используют общую модель `Character`; подготовленная ранее компоновка листа сохранена.

## Реализовано

- Боевой стиль открывает те же сложности навыка, что и кнопки навыков слева. Рядом есть описание с происхождением, источником, оружием, чертами и эффектами. Выбранная черта показана в листе и открывает своё описание. Список доступного стилю оружия отделён от фактического инвентаря.
- Названия наступательных и защитных эффектов оружия открывают общий диалог правил. Используется существующий справочник Mythras Tools, включая квалифицированные названия вроде `Pin Weapon (Shield)`. Для пользовательских эффектов берётся сохранённое описание; при его отсутствии лист прямо сообщает об этом. Оружие можно раскрыть кнопкой с клавиатуры.
- У Theism есть редактируемые текущий и максимальный Devotion Pool. Сохраняются исходные поля `devotionPool` / `devotionPoolCurrent`; текущий запас ограничен диапазоном от нуля до максимума. Максимум задаёт игрок по рангу в культе.
- Sorcery показывает лимит очков формирования: `ceil(Shaping / 10)`. Лимит пересчитывается при изменении навыка, характеристик и эффектов, включая предпросмотр прокачки. Это вместимость формирования заклинания, а не расходуемый запас. Карточки Theism и Sorcery доступны также обученному персонажу без выбранных заклинаний. Обученная специализация магического навыка не скрывается за необученной общей записью.
- Схема тела заменена семичастным SVG-рельефом по мотивам греческого куроса. У значений стоят контурные сердце и щит; диапазоны попаданий сопровождает SVG D20. Сохранены выбор локации мышью и клавиатурой, текущие/максимальные HP, AP, состояния повреждений и отметка травмы. Гравировка не перехватывает нажатия.
- Movement содержит отдельную плашку плавания. Формула прежнего листа: движение + один метр за полные 20% Swim; используется общий с остальными режимами движения учёт усталости, неподвижное состояние даёт ноль.
- «Изменить в конструкторе» из оружия открывает шаг 18 Customization и раскрывает Weapons, items & armour. Ссылки брони и предметов открывают соответствующие панели шага 17 Starting Equipment; магия — шаг 16 Starting Magic. Явная цель имеет приоритет над последним сохранённым шагом.
- В Starting Equipment по умолчанию доступен прямой выбор 13 именованных вариантов брони. До выбора показаны материал, AP, ENC и цена; после — также основа и конструкция. Выбор заполняет существующую локацию брони. Числа можно редактировать. «Пошаговая настройка» сохраняет прежнюю последовательность и множители материалов. Переключение режимов само по себе не меняет сохранённую броню.
- Исправлен показ явного пользовательского урона оружия: поле `damage` заменяет базовый урон, а не дописывается к нему.

## Проверка

- `npm run build` — успешная production-сборка, без предупреждений Angular. Проверена сгенерированная сборка из `dist/mythras-tools`.
- `npm run test:compat` — 73 успешных теста в ChromeHeadless: совместимость JSON и хранилища, навыки и HP, магия, плавание, границы Shaping 10/11%, пулы, переходы и оба способа настройки брони.
- Браузерная проверка Chromium с «Конан Варвар.json» и `character(1).json`: импорт и экспорт всех исходных полей, клавиатурный выбор семи локаций, сложности стиля, описание стиля и выбранной черты, все эффекты оружия из предоставленных сохранений, плавание, переходы в конструктор, готовая броня, ручное изменение AP, прежняя последовательность материалов, сохранение и перезагрузка.
- Дополнительный искусственный персонаж: Shaping 31% даёт 4 очка, специализация Invocation открывает свой навык, Theism/Sorcery без заклинаний показывают ресурсы, неизвестное расширение JSON сохраняется.
- Проверены ширины 1920, 960 и 390 px: горизонтального переполнения страницы нет; широкая таблица оружия прокручивается внутри блока. Проверены мобильные панели брони и магии. Диалоги закрываются Escape и возвращают фокус вызывающей кнопке. Ошибок JavaScript в проверенных сценариях не обнаружено.
- `git diff --check` — без ошибок.

## Источники и границы

Формула формирования сопоставлена с [Roll20 Mythras v2.7](https://github.com/Roll20/roll20-character-sheets/blob/master/Mythras/archives/v2.7/Mythras.html), полем `attr_shaping_points_max`; прямой проверки текста книги в этой среде не было. Плавание сверено с `getSwim()` прежнего responsive viewer и печатного листа. Быстрые варианты брони построены из прежней таблицы конструкций и множителей Mythras Tools: новые правила стоимости не вводились, цена относится к одной локации.

Описания правил и названия каталога сохраняют исходный английский текст. Для произвольного пользовательского эффекта без описания справку необходимо заполнить самостоятельно. Из прежнего [анализа листа](CHARACTER-SHEET-ANALYSIS.md) исправлен R4 (ручной урон оружия) и часть R6 (предпросмотр движения). Остаются прежние вопросы вне этого набора изменений: R1 — урон при HP выше максимума; R2 — модификатор затрагивает все одноимённые навыки; R3 — пустой override штрафа брони принимается за ноль; несогласованность игровых операций HP с предпросмотром прокачки. Остальные ограничения и будущие функции описаны в исходном анализе.

Публикационная папка `docs/` и основная ветка не изменялись. Опубликованный GitHub Pages сайт остаётся прежним до отдельного обновления публикационной сборки и слияния.

## Изменённые файлы

- [design/COMPANION-GAMEPLAY-UPDATE.md](../design/COMPANION-GAMEPLAY-UPDATE.md)
- [design/UI-KIT.md](../design/UI-KIT.md)
- [package.json](../package.json)
- [src/app/character/customization/customization.component.html](../src/app/character/customization/customization.component.html)
- [src/app/character/customization/customization.component.ts](../src/app/character/customization/customization.component.ts)
- [src/app/character/equipment-edit/equipment-edit.component.html](../src/app/character/equipment-edit/equipment-edit.component.html)
- [src/app/character/equipment-edit/equipment-edit.component.scss](../src/app/character/equipment-edit/equipment-edit.component.scss)
- [src/app/character/equipment-edit/equipment-edit.component.spec.ts](../src/app/character/equipment-edit/equipment-edit.component.spec.ts)
- [src/app/character/equipment-edit/equipment-edit.component.ts](../src/app/character/equipment-edit/equipment-edit.component.ts)
- [src/app/character/equipment/equipment.component.html](../src/app/character/equipment/equipment.component.html)
- [src/app/character/equipment/equipment.component.ts](../src/app/character/equipment/equipment.component.ts)
- [src/app/pages/character-creation/character-creation.component.ts](../src/app/pages/character-creation/character-creation.component.ts)
- [src/app/pages/companion-character-sheet/companion-character-sheet.component.html](../src/app/pages/companion-character-sheet/companion-character-sheet.component.html)
- [src/app/pages/companion-character-sheet/companion-character-sheet.component.scss](../src/app/pages/companion-character-sheet/companion-character-sheet.component.scss)
- [src/app/pages/companion-character-sheet/companion-character-sheet.component.spec.ts](../src/app/pages/companion-character-sheet/companion-character-sheet.component.spec.ts)
- [src/app/pages/companion-character-sheet/companion-character-sheet.component.ts](../src/app/pages/companion-character-sheet/companion-character-sheet.component.ts)
- [src/app/services/armour-catalog.ts](../src/app/services/armour-catalog.ts)
- [src/app/services/builder-navigation.spec.ts](../src/app/services/builder-navigation.spec.ts)
- [src/app/services/builder-navigation.ts](../src/app/services/builder-navigation.ts)
- [src/app/services/companion-sheet.spec.ts](../src/app/services/companion-sheet.spec.ts)
- [src/app/services/companion-sheet.ts](../src/app/services/companion-sheet.ts)
- [src/assets/ui/sheet-icons.svg](../src/assets/ui/sheet-icons.svg)
