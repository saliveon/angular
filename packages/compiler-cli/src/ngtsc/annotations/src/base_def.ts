/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {R3BaseRefMetaData, compileBaseDefFromMetadata} from '@angular/compiler';
import * as ts from 'typescript';

import {PartialEvaluator} from '../../partial_evaluator';
import {ClassMember, Decorator, ReflectionHost} from '../../reflection';
import {AnalysisOutput, CompileResult, DecoratorHandler, DetectResult, HandlerPrecedence} from '../../transform';
import {isAngularCore} from './util';

function containsNgTopLevelDecorator(decorators: Decorator[] | null): boolean {
  if (!decorators) {
    return false;
  }
  return decorators.find(
             decorator => (decorator.name === 'Component' || decorator.name === 'Directive' ||
                           decorator.name === 'NgModule') &&
                 isAngularCore(decorator)) !== undefined;
}

export class BaseDefDecoratorHandler implements
    DecoratorHandler<R3BaseRefMetaData, R3BaseRefDecoratorDetection> {
  constructor(private reflector: ReflectionHost, private evaluator: PartialEvaluator) {}

  readonly precedence = HandlerPrecedence.WEAK;

  detect(node: ts.ClassDeclaration, decorators: Decorator[]|null):
      DetectResult<R3BaseRefDecoratorDetection>|undefined {
    if (containsNgTopLevelDecorator(decorators)) {
      // If the class is already decorated by @Component or @Directive let that
      // DecoratorHandler handle this. BaseDef is unnecessary.
      return undefined;
    }

    let result: R3BaseRefDecoratorDetection|undefined = undefined;

    this.reflector.getMembersOfClass(node).forEach(property => {
      const {decorators} = property;
      if (decorators) {
        for (const decorator of decorators) {
          const decoratorName = decorator.name;
          if (decoratorName === 'Input' && isAngularCore(decorator)) {
            result = result || {};
            const inputs = result.inputs = result.inputs || [];
            inputs.push({decorator, property});
          } else if (decoratorName === 'Output' && isAngularCore(decorator)) {
            result = result || {};
            const outputs = result.outputs = result.outputs || [];
            outputs.push({decorator, property});
          }
        }
      }
    });

    if (result !== undefined) {
      return {
        metadata: result,
        trigger: null,
      };
    } else {
      return undefined;
    }
  }

  analyze(node: ts.ClassDeclaration, metadata: R3BaseRefDecoratorDetection):
      AnalysisOutput<R3BaseRefMetaData> {
    const analysis: R3BaseRefMetaData = {};
    if (metadata.inputs) {
      const inputs = analysis.inputs = {} as{[key: string]: string | [string, string]};
      metadata.inputs.forEach(({decorator, property}) => {
        const propName = property.name;
        const args = decorator.args;
        let value: string|[string, string];
        if (args && args.length > 0) {
          const resolvedValue = this.evaluator.evaluate(args[0]);
          if (typeof resolvedValue !== 'string') {
            throw new TypeError('Input alias does not resolve to a string value');
          }
          value = [resolvedValue, propName];
        } else {
          value = propName;
        }
        inputs[propName] = value;
      });
    }

    if (metadata.outputs) {
      const outputs = analysis.outputs = {} as{[key: string]: string};
      metadata.outputs.forEach(({decorator, property}) => {
        const propName = property.name;
        const args = decorator.args;
        let value: string;
        if (args && args.length > 0) {
          const resolvedValue = this.evaluator.evaluate(args[0]);
          if (typeof resolvedValue !== 'string') {
            throw new TypeError('Output alias does not resolve to a string value');
          }
          value = resolvedValue;
        } else {
          value = propName;
        }
        outputs[propName] = value;
      });
    }

    return {analysis};
  }

  compile(node: ts.Declaration, analysis: R3BaseRefMetaData): CompileResult[]|CompileResult {
    const {expression, type} = compileBaseDefFromMetadata(analysis);

    return {
      name: 'ngBaseDef',
      initializer: expression, type,
      statements: [],
    };
  }
}

export interface R3BaseRefDecoratorDetection {
  inputs?: Array<{property: ClassMember, decorator: Decorator}>;
  outputs?: Array<{property: ClassMember, decorator: Decorator}>;
}
