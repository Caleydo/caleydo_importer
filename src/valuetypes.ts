/**
 * Created by Samuel Gratzl on 29.09.2016.
 */

import {generateDialog} from 'phovea_ui/src/dialogs';
import {list as listPlugins, load as loadPlugins, IPlugin, get as getPlugin} from 'phovea_core/src/plugin';
import {mixin} from 'phovea_core/src/index';

//https://github.com/d3/d3-3.x-api-reference/blob/master/Ordinal-Scales.md#category10
const categoryColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];

export interface ITypeDefinition {
  type: string;
  [key: string]: any;
}

export interface IValueTypeEditor {
  /**
   * guesses whether the given data is of the given type, returns a confidence value
   * @param name name of the column
   * @param index the index of the column
   * @param data
   * @param accessor
   * @param sampleSize
   * @return the confidence (0 ... not, 1 ... sure) that this is the right value type
   */
  isType(name: string, index: number, data: any[], accessor: (row: any) => string, sampleSize: number): Promise<number>|number;
  /**
   * parses the given value and updates them inplace
   * @return an array containing invalid indices
   */
  parse(def: ITypeDefinition, data: any[], accessor: (row: any, value?: any) => any): number[];
  /**
   * guesses the type definition options
   * @param def
   * @param data
   * @param accessor
   */
  guessOptions(def: ITypeDefinition, data: any[], accessor: (row: any) => any): Promise<ITypeDefinition>|ITypeDefinition;
  /**
   * opens and editor to edit the options
   * @param def
   */
  edit(def: ITypeDefinition);

  /**
   * returns markup to show inside a select box. the markup is either a single option or a whole optgroup with options
   * if it is an optgroup, the editor type is represented as data-type attribute, whereas the subtype is the option's value (e.g. optgroup[data-type=idType], option[value=Ensembl])
   * @param current current editor
   * @param def definition of the editor. E.g. which type the editor is (and which idType the column has if it is an IDTypeEditor)
   */
  getOptionsMarkup(current: ValueTypeEditor, def: ITypeDefinition): Promise<string>|string;
}

export function createDialog(title: string, classSuffix: string, onSubmit: ()=>any) {
  const dialog = generateDialog(title, 'Save');
  dialog.body.classList.add('caleydo-importer-' + classSuffix);
  const form = dialog.body.ownerDocument.createElement('form');
  dialog.body.appendChild(form);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    onSubmit();
  });
  dialog.onHide(() => {
    dialog.destroy();
  });
  dialog.onSubmit(onSubmit);
  return dialog;
}

/**
 * edits the given type definition in place with categories
 * @param definition call by reference argument
 * @return {Promise<R>|Promise}
 */
function editString(definition: ITypeDefinition) {
  const def: any = definition;
  const convert = def.convert || null;
  const regexFrom = def.regexFrom || null;
  const regexTo = def.regexTo || null;

  return new Promise((resolve) => {
    const dialog = createDialog('Edit String Conversion', 'string', () => {
      dialog.hide();
      definition.type = 'string';
      def.convert = findSelectedRadio();
      def.regexFrom = def.convert === 'regex' ? (<HTMLInputElement>(dialog.body.querySelector('input[name="regexFrom"]'))).value : null;
      def.regexTo = def.convert === 'regex' ? (<HTMLInputElement>(dialog.body.querySelector('input[name="regexTo"]'))).value : null;

      resolve(definition);
    });
    dialog.body.innerHTML = `
        <div class="form-group">
          <label>Text Conversion</label>
          
          <div class="radio">
            <label class="radio">
              <input type="radio" name="string-convert" value="" ${!convert ? 'checked="checked"' : ''}> None
            </label>
           </div>
          <div class="radio">
            <label class="radio">
              <input type="radio" name="string-convert" value="toUpperCase" ${convert === 'toUpperCase' ? 'checked="checked"' : ''}> UPPER CASE
            </label>
           </div>
          <div class="radio">
            <label class="radio">
              <input type="radio" name="string-convert" value="toLowerCase" ${convert === 'toLowerCase' ? 'checked="checked"' : ''}> lower case
            </label>
           </div>
          <div class="radio">
            <label class="radio">
              <input type="radio" name="string-convert" value="regex" ${convert === 'regex"' ? 'checked="checked"' : ''}> Regex Replacement
            </label>
           </div>
          </div>
          <div class="form-group">
            <label for="regexFrom">Regex Search Expression</label>
            <input type="text" class="form-control" ${convert !== 'regex' ? 'disabled="disabled"' : ''} name="regexFrom" value="${regexFrom || ''}">
          </div>
          <div class="form-group">
            <label for="regexTo">Regex Replacement Expression</label>
            <input type="text" class="form-control"  ${convert !== 'regex' ? 'disabled="disabled"' : ''} name="regexTo" value="${regexTo || ''}">
          </div>
    `;
    const choices = ([].slice.apply(dialog.body.querySelectorAll('input[type="radio"]')));
    choices.forEach((e) => e.addEventListener('change', function () {
      const regexSelected = (this.checked && this.value === 'regex');
      ([].slice.apply(dialog.body.querySelectorAll('input[type="text"]'))).forEach((e) => e.disabled = !regexSelected);
    }));

    function findSelectedRadio() {
      const first = choices.filter((e) => e.checked)[0];
      return first ? first.value : '';
    }

    dialog.show();
  });
}

function guessString(def: ITypeDefinition, data: any[], accessor: (row: any) => string) {
  const anyDef: any = def;
  if (typeof anyDef.convert !== 'undefined') {
    return def;
  }
  anyDef.convert = null;
  return def;
}

function parseString(def: ITypeDefinition, data: any[], accessor: (row: any, value?: any) => string) {
  const anydef: any = def;
  const regexFrom = new RegExp(anydef.regexFrom);
  const regexTo = anydef.regexTo;

  const lookup = {
    toLowerCase: (d: string)=>d.toLowerCase(),
    toUpperCase: (d: string)=>d.toUpperCase(),
    regex: (d: string)=>d.replace(regexFrom, regexTo)
  };
  const op = lookup[anydef.convert];

  if (!op) {
    return [];
  }

  const invalid = [];
  data.forEach((d, i) => {
    let v = String(accessor(d));
    v = op(v);
    accessor(d, v);
  });
  return invalid;
}

export function singleOption(this: ValueTypeEditor, current: ValueTypeEditor) {
  return `<option value="${this.id}" ${current && current.id === this.id ? 'selected="selected"' : ''}>${this.name}</option>`;
}

export function string_(): IValueTypeEditor {
  return {
    isType: () => 1, //always a string
    parse: parseString,
    guessOptions: guessString,
    edit: editString,
    getOptionsMarkup: singleOption
  };
}

/**
 * edits the given type definition in place with categories
 * @param definition call by reference argument
 * @return {Promise<R>|Promise}
 */
function editCategorical(definition: ITypeDefinition) {
  const cats = (<any>definition).categories || [];

  return new Promise((resolve) => {
    const dialog = createDialog('Edit Categories (name TAB color)', 'categorical', () => {
      const text = (<HTMLTextAreaElement>dialog.body.querySelector('textarea')).value;
      const categories = text.trim().split('\n').map((row) => {
        const l = row.trim().split('\t');
        return {name: l[0].trim(), color: l.length > 1 ? l[1].trim() : 'gray'};
      });
      dialog.hide();
      definition.type = 'categorical';
      (<any>definition).categories = categories;
      resolve(definition);
    });
    dialog.body.classList.add('caleydo-importer-');
    dialog.body.innerHTML = `
        <textarea class="form-control">${cats.map((cat) => cat.name + '\t' + cat.color).join('\n')}</textarea>
    `;
    const textarea = dialog.body.querySelector('textarea');
    //http://stackoverflow.com/questions/6637341/use-tab-to-indent-in-textarea#6637396 enable tab character
    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.keyCode === 9 || e.which === 9) {
        e.preventDefault();
        const s = textarea.selectionStart;
        textarea.value = textarea.value.substring(0, textarea.selectionStart) + '\t' + textarea.value.substring(textarea.selectionEnd);
        textarea.selectionEnd = s + 1;
      }
    });
    dialog.show();
  });
}

function guessCategorical(def: ITypeDefinition, data: any[], accessor: (row: any) => string) {
  const anyDef: any = def;
  if (typeof anyDef.categories !== 'undefined') {
    return def;
  }
  //unique values
  const cache = {};
  data.forEach((row) => {
    const v = accessor(row);
    cache[v] = v;
  });
  anyDef.categories = Object.keys(cache).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((cat, i) => ({
    name: cat,
    color: categoryColors[i] || 'gray'
  }));
  return def;
}

function isCategorical(name: string, index: number, data: any[], accessor: (row: any) => string, sampleSize: number) {
  const testSize = Math.min(data.length, sampleSize);
  if (testSize <= 0) {
    return 0;
  }
  const categories = {};
  let validSize = 0;
  for (let i = 0; i < testSize; ++i) {
    const v = accessor(data[i]);
    if (v == null || v.trim().length === 0) {
      continue; //skip empty samples
    }
    validSize++;
    categories[v] = v;
  }

  const numCats = Object.keys(categories).length;
  return 1 - numCats / validSize;
}

function parseCategorical(def: ITypeDefinition, data: any[], accessor: (row: any, value?: any) => string) {
  const categories = ((<any>def).categories || []).map((cat) => cat.name);
  const invalid = [];

  function isValidCategory(v: string) {
    return categories.indexOf(v) >= 0;
  }

  data.forEach((d, i) => {
    const v = accessor(d);
    if (!isValidCategory(v)) {
      invalid.push(i);
    }
  });
  return invalid;
}

export function categorical(): IValueTypeEditor {
  return {
    isType: isCategorical,
    parse: parseCategorical,
    guessOptions: guessCategorical,
    edit: editCategorical,
    getOptionsMarkup: singleOption
  };
}

/**
 * edits the given type definition in place with numerical properties
 * @param definition call by reference argument
 * @return {Promise<R>|Promise}
 */
export function editNumerical(definition: ITypeDefinition): Promise<ITypeDefinition> {
  const range = (<any>definition).range || [0, 100];

  return new Promise((resolve) => {
    const dialog = createDialog('Edit Numerical Range', 'numerical', () => {
      const minR = parseFloat((<HTMLInputElement>dialog.body.querySelector('input[name=numerical-min]')).value);
      const maxR = parseFloat((<HTMLInputElement>dialog.body.querySelector('input[name=numerical-max]')).value);
      dialog.hide();
      (<any>definition).range = [minR, maxR];
      resolve(definition);
    });
    dialog.body.innerHTML = `
        <div class="form-group">
          <label for="minRange">Minimum Value</label>
          <input type="number" class="form-control" name="numerical-min" step="any" value="${range[0]}">
        </div>
        <div class="form-group">
          <label for="maxRange">Maximum Value</label>
          <input type="number" class="form-control" name="numerical-max" step="any" value="${range[1]}">
        </div>
    `;
    dialog.show();
  });
}

function isMissingNumber(v: string) {
  return v == null || v.trim().length === 0 || v === 'NaN';
}

export function guessNumerical(def: ITypeDefinition, data: any[], accessor: (row: any) => string) {
  //TODO support different notations, comma vs point
  const anyDef: any = def;
  if (typeof anyDef.range !== 'undefined') {
    return def;
  }
  let minV = NaN;
  let maxV = NaN;
  data.forEach((row) => {
    const raw = accessor(row);
    if (isMissingNumber(raw)) {
      return; //skip
    }
    const v = parseFloat(raw);
    if (isNaN(minV) || v < minV) {
      minV = v;
    }
    if (isNaN(maxV) || v > maxV) {
      maxV = v;
    }
  });
  anyDef.range = [isNaN(minV) ? 0: minV, isNaN(maxV) ? 100 : maxV];
  return def;
}

function isNumerical(name: string, index: number, data: any[], accessor: (row: any) => string, sampleSize: number) {
  const testSize = Math.min(data.length, sampleSize);
  if (testSize <= 0) {
    return 0;
  }
  const isFloat = /^\s*-?(\d*\.?\d+|\d+\.?\d*)(e[-+]?\d+)?\s*$/i;
  let numNumerical = 0;
  let validSize = 0;

  for (let i = 0; i < testSize; ++i) {
    const v = accessor(data[i]);
    if (isMissingNumber(v)) {
      continue; //skip empty samples
    }
    validSize++;
    if (isFloat.test(v) || v === 'NaN') {
      numNumerical += 1;
    }
  }
  return numNumerical / validSize;
}

function parseNumerical(def: ITypeDefinition, data: any[], accessor: (row: any, value?: any) => string) {
  const isInt = def.type === 'int';
  const invalid = [];
  const isFloat = /^\s*-?(\d*\.?\d+|\d+\.?\d*)(e[-+]?\d+)?\s*$/i;
  data.forEach((d, i) => {
    const v = accessor(d);
    if (isMissingNumber(v)) {
      accessor(d, NaN);
      return;
    }
    if (!isFloat.test(v)) {
      invalid.push(i);
    } else {
      accessor(d, isInt ? parseInt(v,10) : parseFloat(v));
    }
  });
  return invalid;
}

export function numerical(): IValueTypeEditor {
  return {
    isType: isNumerical,
    parse: parseNumerical,
    guessOptions: guessNumerical,
    edit: editNumerical,
    getOptionsMarkup: singleOption
  };
}

/**
 * edits the given type definition in place with matrix properties
 * @param definition call by reference argument
 * @return {Promise<R>|Promise}
 */
export function editMatrix(definition: ITypeDefinition): Promise<ITypeDefinition> {
  const anyDef: any = definition;
  const range = anyDef.range || [0, 100];
  const dataLength = anyDef.dataLength || 0;
  const colorRange = anyDef.colorRange || ['#FFFFFF', '#000000'];
  const labels = anyDef.labels || [];

  return new Promise((resolve) => {
    const dialog = createDialog('Edit Numerical Range', 'numerical', () => {
      const rangeMin = parseFloat((<HTMLInputElement>dialog.body.querySelector('input[name="range-min"]')).value);
      const rangeMax = parseFloat((<HTMLInputElement>dialog.body.querySelector('input[name="range-max"]')).value);
      anyDef.range = [rangeMin, rangeMax];
      anyDef.dataLength = parseInt((<HTMLInputElement>dialog.body.querySelector('input[name="datalength"]')).value, 10);
      const colorRangeMin = (<HTMLInputElement>dialog.body.querySelector('input[name="colorrange-min"]')).value;
      const colorRangeMax = (<HTMLInputElement>dialog.body.querySelector('input[name="colorrange-max"]')).value;
      anyDef.colorRange = [colorRangeMin, colorRangeMax];
      anyDef.labels = (<HTMLInputElement>dialog.body.querySelector('textarea[name="labels"]')).value.split('\n');
      dialog.hide();
      resolve(definition);
    });
    dialog.body.innerHTML = `
        <div class="form-group">
          <label>Minimum Value</label>
          <input type="number" class="form-control" name="range-min" step="any" value="${range[0]}">
        </div>
        <div class="form-group">
          <label>Maximum Value</label>
          <input type="number" class="form-control" name="range-max" step="any" value="${range[1]}">
        </div>
        <div class="form-group">
          <label>Length of Data</label>
          <input type="number" class="form-control" name="datalength" step="1" min="0" value="${dataLength}">
        </div>
        <div class="form-group">
          <label>Color of Minimum Value</label>
          <input type="color" class="form-control" name="colorrange-min" value="${colorRange[0]}">
        </div>
        <div class="form-group">
          <label>Color of Maximum Value</label>
          <input type="color" class="form-control" name="colorrange-max" value="${colorRange[1]}">
        </div>
        <div class="form-group">
          <label>Labels</label>
          <textarea class="form-control" name="labels">${labels.join('\n')}</textarea>
        </div>
    `;
    dialog.show();
  });
}

export function guessMatrix(def: ITypeDefinition, data: any[], accessor: (row: any) => string) {
  const anyDef: any = def;
  let minV = NaN;
  let maxV = NaN;
  let maxLength = 0;
  data.forEach((row) => {
    try {
      const values = JSON.parse(accessor(row));
      values.forEach((raw, i) => {
        const v = parseFloat(raw);
        if (isNaN(minV) || v < minV) {
          minV = v;
        }
        if (isNaN(maxV) || v > maxV) {
          maxV = v;
        }
      });
      if(values.length > maxLength) {
        maxLength = values.length;
      }
    }catch(e) {
      return; //skip
    }
  });
  anyDef.range = [isNaN(minV) ? 0: minV, isNaN(maxV) ? 100 : maxV];
  anyDef.dataLength = maxLength;
  anyDef.colorRange = ['#FFFFFF', '#000000'];
  anyDef.labels = Array.from(Array(maxLength).keys());
  return def;
}

function isMatrix(name: string, index: number, data: any[], accessor: (row: any) => string, sampleSize: number) {
  const testSize = Math.min(data.length, sampleSize);
  if (testSize <= 0) {
    return 0;
  }
  let numMatrix = 0;

  for (let i = 0; i < testSize; ++i) {
    try {
      const v = JSON.parse(accessor(data[i]));
      if (typeof v === 'object') {
        numMatrix++;
      }
    }catch (e) {
      //parse failed, it is not a matrix
    }
  }
  return numMatrix / testSize;
}

function parseMatrix(def: ITypeDefinition, data: any[], accessor: (row: any, value?: any) => string) {
  const invalid = [];
  data.forEach((d, i) => {
    try {
      const v = JSON.parse(accessor(d));
      if(typeof v === 'object') {
        accessor(d, v);
      }else {
        invalid.push(i);
      }
    }catch(e) {
      invalid.push(i);
    }
  });
  return invalid;
}

export function matrix(): IValueTypeEditor {
  return {
    isType: isMatrix,
    parse: parseMatrix,
    guessOptions: guessMatrix,
    edit: editMatrix,
    getOptionsMarkup: singleOption
  };
}

export class ValueTypeEditor implements IValueTypeEditor {
  private desc: any;
  private impl: IValueTypeEditor;

  constructor(impl: IPlugin) {
    this.desc = impl.desc;
    this.impl = impl.factory();
  }

  get hasEditor() {
    return this.impl.edit != null;
  }

  get isImplicit() {
    return this.desc.implicit === true;
  }

  get priority() {
    return typeof this.desc.priority !== 'undefined' ? this.desc.priority : 100;
  }

  get name() {
    return this.desc.name;
  }

  get id() {
    return this.desc.id;
  }

  isType(name: string, index: number, data: any[], accessor: (row: any) => string, sampleSize: number) {
    return this.impl.isType(name, index, data, accessor, sampleSize);
  };

  parse(def: ITypeDefinition, data: any[], accessor: (row: any, value?: any) => any): number[] {
    def.type = this.id;
    this.impl.guessOptions(def, data, accessor);
    return this.impl.parse(def, data, accessor);
  }

  guessOptions(def: ITypeDefinition, data: any[], accessor: (row: any) => any) {
    def.type = this.id;
    return this.impl.guessOptions(def, data, accessor);
  }

  edit(def: ITypeDefinition) {
    def.type = this.id;
    return this.impl.edit(def);
  }

  getOptionsMarkup(current: ValueTypeEditor, def: ITypeDefinition) {
    return this.impl.getOptionsMarkup.call(this, current, def);
  }
}

export function createCustomValueTypeEditor(name: string, id: string, implicit: boolean, desc: IValueTypeEditor) {
  return new ValueTypeEditor(<any>{
    desc: {
      name,
      id,
      implicit
    },
    factory: ()=>desc
  });
}

const EXTENSION_POINT = 'importer_value_type';

export function createValueTypeEditor(id: string): Promise<ValueTypeEditor> {
  const p = getPlugin(EXTENSION_POINT, id);
  if (!p) {
    return Promise.reject('not found: ' + id);
  }
  return p.load().then((impl) => new ValueTypeEditor(impl));
}

export function createValueTypeEditors(): Promise<ValueTypeEditor[]> {
  return loadPlugins(listPlugins(EXTENSION_POINT).sort((a, b) => a.name.localeCompare(b.name))).then((impls) => impls.map((i) => new ValueTypeEditor(i)));
}

export interface IGuessOptions {
  /**
   * number of samples considered
   */
  sampleSize?: number; //100
  /**
   * threshold if more than X percent of the samples are numbers it will be detected as number
   * numerical - 0.7
   * categorical - 0.7
   */
  thresholds?: { [type: string]: number };
}

/**
 * guesses the value type returning a string
 * @param editors the possible types
 * @param name the name of the column/file for helper
 * @param index the index of this column
 * @param data the data
 * @param accessor to access the column
 * @param options additional options
 * @return {any}
 */
export async function guessValueType(editors: ValueTypeEditor[], name: string, index: number, data: any[], accessor: (row: any) => any, options: IGuessOptions = {}): Promise<ValueTypeEditor> {
  options = mixin({
    sampleSize: 100,
    thresholds: <any>{
      numerical: 0.7,
      categorical: 0.7,
      real: 0.7,
      int: 0.7
    }
  }, options);
  const testSize = Math.min(options.sampleSize, data.length);

  // one promise for each editor for a given column
  const promises = editors.map((editor) => editor.isType(name, index, data, accessor, testSize));

  const confidenceValues = await Promise.all(promises);

  let results = editors.map((editor, i) => ({
    type: editor.id,
    editor,
    confidence: confidenceValues[i],
    priority: editor.priority
  }));

  //filter all 0 confidence ones by its threshold
  results = results.filter((r) => typeof options.thresholds[r.type] !== 'undefined' ? r.confidence >= options.thresholds[r.type] : r.confidence > 0);

  if (results.length <= 0) {
    return null;
  }
  //order by priority (less more important)
  results = results.sort((a, b) => a.priority - b.priority);
  //choose the first one
  return results[0].editor;
}

export async function createTypeEditor(editors: ValueTypeEditor[], current: ValueTypeEditor, def: ITypeDefinition, emptyOne = true) {
  const optionsPromises = editors.map((editor) => editor.getOptionsMarkup(current, def));
  const options = await Promise.all(optionsPromises);

 return `<select class="form-control">
        ${emptyOne? '<option value=""></option>':''}
        ${options.join('\n')}
    </select>
    <span class="input-group-btn">
      <button class="btn btn-secondary" ${!current || !current.hasEditor ? 'disabled="disabled' : ''} type="button"><i class="glyphicon glyphicon-cog"></i></button>
    </span>`;
}

export function updateType(editors: ValueTypeEditor[], emptyOne = true) {
  return function (d) {
    const parent = this.options[this.selectedIndex].parentNode;

    let type = null;
    if(parent.nodeName !== 'OPTGROUP') {
      type = editors.find((editor) => editor.id === this.value) || null;
    } else {
      // find type based on the surrounding optgroup
      // the type of the editor is saved as the data-type of the optgroup, the value is the subtype (e.g. idType)
      type = editors.find((editor) => editor.id === parent.dataset.type) || null;
      d.value[parent.dataset.type] = this.value;
    }

    d.value.type = type ? type.id : '';
    d.editor = type;
    const configure = <HTMLButtonElement>this.parentElement.querySelector('button');

    if (!type || !type.hasEditor) {
      configure.classList.add('disabled');
      configure.disabled = true;
    } else {
      configure.classList.remove('disabled');
      configure.disabled = false;
    }
    const isIDType = !type || type.isImplicit;
    const tr = this.parentElement.parentElement;

    tr.className = isIDType ? 'info' : '';
    const input = tr.querySelector('input');
    if(input) {
      (<HTMLInputElement>(input)).disabled = isIDType;
    }
  };
}
