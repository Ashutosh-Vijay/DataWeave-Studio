package com.dwstudio

import org.mule.weave.v2.codegen.CodeGenerator
import org.mule.weave.v2.editor.{ QuickFix, QuickFixAction, WeaveTextDocument }
import org.mule.weave.v2.inspector.{ CodeInspector, CodeInspectorProvider }
import org.mule.weave.v2.inspector.ReferenceUtils.isReferencingTo
import org.mule.weave.v2.parser.{ InspectorPhaseCategory, MessageCategory, QuickFixAwareMessage }
import org.mule.weave.v2.parser.ast.AstNode
import org.mule.weave.v2.parser.ast.functions.FunctionCallNode
import org.mule.weave.v2.parser.ast.variables.NameIdentifier.CORE_MODULE
import org.mule.weave.v2.parser.ast.variables.VariableReferenceNode
import org.mule.weave.v2.parser.phase.{ AstNodeResultAware, ParsingContext, ScopeNavigatorResultAware }

/**
 * Studio's own lint rules, added to the engine's.
 *
 * The nine rules the engine ships (sizeOf-equals-zero, unnecessary if, double
 * negation, deprecated `using`, …) are welded into the normal parse and have
 * been surfacing in Studio all along. What 2.12 added is the SPI below: a
 * `CodeInspectorProvider` found through `ServiceLoader` contributes rules
 * *alongside* the built-ins, and any message implementing `QuickFixAwareMessage`
 * flows through the existing quick-fix path with no other wiring. The shade
 * plugin merges service files rather than replacing them, so registering ours
 * does not displace the engine's own provider.
 */
class DwStudioInspectorProvider extends CodeInspectorProvider {
  override def scopeInspectors: Seq[CodeInspector[AstNodeResultAware[_] with ScopeNavigatorResultAware]] =
    Seq(LeftoverLogInspector)
}

/**
 * Flags a call to `log(...)` left in the script.
 *
 * `log` returns its argument untouched, so it is invisible in the output and
 * easy to leave behind — which is exactly why people reach for it, and exactly
 * why it survives into scripts that ship. Reported as a hint rather than a
 * warning: logging on purpose is legitimate, and a yellow squiggle on every
 * deliberate `log` would be worse than saying nothing.
 */
object LeftoverLogInspector extends CodeInspector[AstNodeResultAware[_] with ScopeNavigatorResultAware] {

  override def inspect(
    node: AstNode,
    scopeData: AstNodeResultAware[_] with ScopeNavigatorResultAware,
    parsingContext: ParsingContext): Unit = {
    node match {
      case call @ FunctionCallNode(vrn: VariableReferenceNode, params, _, _)
        if params.args.nonEmpty && isReferencingTo(vrn.variable, CORE_MODULE.::("log"), scopeData.scope) =>
        parsingContext.messageCollector.warning(LeftoverLog(call, params.args.last), call.location())
      case _ =>
    }
  }
}

/** `log(x)` and `log("label", x)` both return the last argument, so unwrapping
 *  to it is the fix in either shape. */
case class LeftoverLog(call: AstNode, value: AstNode) extends QuickFixAwareMessage {
  override def kind: String = "LeftoverLog"
  override def category: MessageCategory = InspectorPhaseCategory
  override def message: String =
    "`log` returns its input unchanged, so this does nothing to the output and is easy to forget. " +
      "Turn on Trace to see every expression's value without editing the script."
  override def quickFixes(): Array[QuickFix] =
    Array(QuickFix("Remove log(...)", "Unwrap this call, keeping the value it logs.", new RemoveLogAction(call, value)))
}

class RemoveLogAction(call: AstNode, value: AstNode) extends QuickFixAction {
  override def run(document: WeaveTextDocument): Unit = {
    val start = call.location().startPosition.index
    document.delete(start, call.location().endPosition.index)
    document.insert(CodeGenerator.generate(value), start)
  }
}
