
import {
	Token, Type, TypeNames, BasicType, AST, ASTVisitor, Expression,
	Block, Prefix, Infix, Postfix, Call, Product, Morphism,
	Primary, Void, Identifier, Declaration, Alias, Environment, Variable, Kind,
	Multiple, VoidType, List, Assignment, ListType, Category, TokenType
} from "./tree.ts";

const errors: { [code: string]: string } = {
	"UPR": "unknown prefix operator",
	"UIO": "unknown infix operator",
	"UPO": "unknown postfix operator",
	"IIO": "invalid infix operation between basic types",
	"IPR": "invalid prefix operation with basic type",
	"IPO": "invalid postfix operation with basic type",
	"VRD": "variable redeclaration",
	"UID": "unknown identifier",
	"UTE": "unknown type error",
};

type TypeError = { message: string, bounds: number[] }; 

const bounds = (token: Token) =>
	[ token.position, token.position + token.lexeme.length ];
const error = (code: string, bounds: number[] = []): TypeError =>
	({ message: errors[code], bounds });

/// prime numbers up to 100
const primes = [
	2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41,
	43,	47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97
];

const $ = (...types: string[]): number => types.reduce(
	(r, t) => r * (primes[TypeNames.indexOf(t)] || 0)
, 1);

const prefix_basic: { [op: string]: number } = {
	"!": $("bln"),
	"-": $("byt", "nat", "int", "rea"),
	"~": $("byt", "nat", "int"),
};

const infix_basic: { [op: string]: number } = {
	"+": $("byt", "nat", "int", "rea"),
	"-": $("byt", "nat", "int", "rea"),
	"*": $("byt", "nat", "int", "rea"),
	"/": $("byt", "nat", "int", "rea"),
	"%": $("byt", "nat", "int", "rea"),
	"^": $("nat", "int", "rea"),
};

const postfix_basic: { [op: string]: number } = {
	"!": $("byt", "nat", "int", "rea"),
};

class Checker implements ASTVisitor {

	tree: AST = new AST(); stack: Type[] = [];

	variables = new Environment();
	
	// when parameter is true, we are defining a parameter
	// when parameter is false, we are defining a variable
	// when parameter is undefined, we are defining a global
	parameter: boolean | undefined = undefined;

	top(): Type | undefined { return this.stack[this.stack.length - 1]; }
	pop(): Type | undefined { return this.stack.pop(); }
	push(type: Type) { this.stack.push(type); }

	assignment(a: Assignment) {
		
	}
	prefix(p: Prefix) {
		p.expression.accept!(this);
		const t = this.top();
		if (t === undefined) throw error("UTE", bounds(p.operator));
		// operator between omoegeneous basic types
		if (t instanceof BasicType) {
			const pt = $((t as BasicType).name);
			if (!(p.operator.lexeme in prefix_basic))
				throw error("UPR", bounds(p.operator));
			if (prefix_basic[p.operator.lexeme] % pt !== 0)
				throw error("IPR", p.bounds);
			this.push(t);
		}
		// todo: operation between high-order types
		throw error("UTE", p.bounds);
	}
	infix(i: Infix) {
		i.lhs.accept!(this);
		if (this.top() === undefined) throw error("UTE", bounds(i.operator));
		const a = this.pop();
		i.rhs.accept!(this);
		if (this.top() === undefined) throw error("UTE", bounds(i.operator));
		const b = this.pop();
		// operator between omoegeneous basic types
		if (a instanceof BasicType && b instanceof BasicType) {
			const pa = $((a as BasicType).name);
			const pb = $((b as BasicType).name);
			if (!(i.operator.lexeme in infix_basic))
				throw error("UIO", bounds(i.operator));
			if (infix_basic[i.operator.lexeme] % (pa * pb) !== 0)
				throw error("IIO", i.bounds);
			this.push(pa > pb ? a : b);
		}
		// todo: operation between high-order types
		throw error("UTE", i.bounds);
	}
	postfix(p: Postfix) {
		p.expression.accept!(this);
		const t = this.top();
		if (t === undefined) throw error("UTE", bounds(p.operator));
		// operator between omoegeneous basic types
		if (t instanceof BasicType) {
			const pt = $((t as BasicType).name);
			if (!(p.operator.lexeme in postfix_basic))
				throw error("UPO", bounds(p.operator));
			if (postfix_basic[p.operator.lexeme] % pt !== 0)
				throw error("IPO", p.bounds);
			this.push(t);
		}
		// todo: operation between high-order types
		throw error("UTE", p.bounds);
	}
	call(c: Call) { }
	product(p: Product) { }
	block(b: Block) { }
	morphism(m: Morphism) {
		this.parameter = true;
		// we must have a stack type for the morphism cast
		// otherwise this stays a full template
		
		// whose responsibility is it to transform the parameters
		// into a list of string identifiers? parser? checker?
		this.parameter = false;
	}
	list(l: List) {
		if (l.expressions.length === 0) {
			// tofix: casting from [()] to array of any on assignment
			this.push(new ListType(new VoidType()));
			return;
		}
		// todo: promote types to a common type
	}
	primary(p: Primary) {
		switch (p.literal.type) {
			case TokenType.boolean: this.push(new BasicType('bln')); break;
			case TokenType.natural: this.push(new BasicType('nat')); break;
			case TokenType.real: this.push(new BasicType('rea')); break;
			case TokenType.character: this.push(new BasicType('chr')); break;
			case TokenType.string:
				this.push(new ListType(new BasicType('chr')));
			break;
			default: throw error("UTE", bounds(p.literal));
		}
	}
	void(v: Void) { this.push(new VoidType(v.o, v.c)); }
	identifier(i: Identifier) {
		const variable = this.variables.lookup(i.symbol.lexeme);
		if (variable === undefined) throw error("UID", bounds(i.symbol));
		this.push(variable.type()!);
	}
	declaration(d: Declaration) {
		if (this.variables.lookup(d.id.symbol.lexeme) !== undefined)
			throw error("VRD", bounds(d.id.symbol));
		this.variables.declare(
			d.id.symbol.lexeme,
			new Variable(this.parameter === undefined ? Kind.global : (
				this.parameter ? Kind.parameter : Kind.local
			), d.prototype)
		);
		// todo: is this a function declaration?
		//       is this a lambda or a clojure?
		//       should we create a new environment?
		// todo: implement polymorphism at some point
	}
	alias(_a: Alias) { }
	multiple(m: Multiple) {
		let last: Type | undefined;
		for (const e of m.expressions) {
			e.accept!(this);
			// discard all results except the last
			last = this.pop()!;
		}
		if (last == undefined) throw error("UTE", m.bounds);
		this.push(last);
	}

	check(ast: Expression[]) {
		this.tree = new AST(); this.stack = [];
		for (const expression of ast) {
			expression.accept!(this);
			// todo: check if the result needs to be discarded
		}
		return this.tree;
	}

}

export const check = (ast: Expression[]): AST => new Checker().check(ast);
