// Function adapted from https://github.com/jkroso/parse-svg-path/blob/master/index.js

var segment = /([astvzqmhlc])([^astvzqmhlc]*)/ig
var number = /-?[0-9]*\.?[0-9]+(?:e[-+]?\d+)?/ig


function parseValues(args) {
	var numbers = args.match(number)
	return numbers ? numbers.map(Number) : []
}

let argCountByType = {
	"C":6,
	"V":1,
	"H":1,
	"M":2,
	"L":2,
	"Q":4,
	"Z":0,
}


function SVGImage(svgText) {
	let parser = new DOMParser();
	let xmlDoc = parser.parseFromString(svgText,"text/xml");
	let pathEls = Array.from(xmlDoc.getElementsByTagName("path"))
	
	this.bounds = [{min:99999,max:-99999},{min:99999,max:-99999}]

	this.paths = []
	let path = undefined
	let last = [0,0]

	pathEls.map(pathEl => {

		let attr = pathEl.getAttribute("d")
		
		// Go through all the commands
		attr.replace(segment, (_, cmd, args) => {
			args = args.trim()
					.replace(/ /g, ",")
					.replace(/-/g, ",-")
					.split(",")
					.map(s => s.trim())
					.filter(s => s.length > 0)
					.map(s => parseFloat(s))
			
			// Watch for NaNs!
			args.forEach(item => {
				if (isNaN(item))
					throw(args)
			})
			
			let cmdUpper = cmd.toUpperCase()
			// How many commands should this have?
			let argCount = argCountByType[cmdUpper]
			let cmdCount = args.length/argCount || 0
			// Start a new path
			if (cmdUpper === "M") {
				path = {
					cmds: []
				}

				this.paths.push(path)
			}

			for (var i = 0; i < cmdCount; i++) {
				let vars = args.slice(i*argCount, (i +1)*argCount)
	
				// Handle relative commands (TODO)
				if (cmdUpper !== cmd) {
					vars = vars.map((v,index) => v + last[index%2])
				}

				switch(cmdUpper) {
					case "M": 
					case "L": 
						path.cmds.push({
							cmd:"L",
							v: vars
						})
						break;
					case "C": 
						path.cmds.push({
							cmd:"C",
							v: vars
						})
						break

					// Horizontal lines
					case "H": 
						// relative?
						let y = last[1]
						vars = vars.map(v => [v,y]).flat()
						
						path.cmds.push({
							cmd:"L",
							v: vars
						})
						break
					case "V": 	
						vars = vars.map(v => [last[0],v]).flat()
						path.cmds.push({
							cmd:"L",
							v: vars
						})
						break
					default: 
						console.warn(cmd)
				}	

				// Update the bounds
				vars.forEach((v, index) => {
					this.bounds[index%2].min = Math.min(this.bounds[index%2].min, v)
					this.bounds[index%2].max = Math.max(this.bounds[index%2].max, v)
				})

				if (vars.length >= 2) {
					last = vars.slice(vars.length - 2)
				}
			}
			
		})

	})

	this.setWinding(1)
}

SVGImage.prototype.setWinding = function(dir =1) {
	let winding = 0
	this.paths.forEach(path => {
		let winding = 0
		for (var i = 0; i < path.cmds.length; i++) {
			let c0 = path.cmds[i]
			let c1 = path.cmds[(i + 1)%path.cmds.length]
			let p0 = c0.v.slice(c0.v.length - 2)
			let p1 = c1.v.slice(c1.v.length - 2)
			let dx = p1[0]-p0[0]
			let dy = p1[1]+p0[1]
			winding += dx*dy

		}

		if (winding*dir < 0)
			reverse(path)
	})
}


function reverse(path) {
	let winding = 0

	// Create a list of all the edges, lines+beziers
	let edges = []
	
	let last = undefined
	path.cmds.forEach(cmd => {
		if (cmd.v.length > 0) {
			
			if (last) {
				let edge = [last]
				// Add the points in order
				for (var i = 0; i < cmd.v.length/2; i++) {
					let x = cmd.v[i*2]
					let y = cmd.v[i*2 +1]
					edge.push([x,y])
				}

				edges.push(edge)
			}

			last = cmd.v.slice(cmd.v.length - 2)

			
		}
	})

	// Reverse the edges
	edges.reverse()
	let reversed = [{
		cmd:"L",
		v:last
	}]

	edges.forEach(e => {
		// Add back to the reversed
		if (e.length == 4) {
			
			v = [...e[2],...e[1],...e[0]]
			reversed.push({
				cmd: "C",
				v:v
			})
		}
		if (e.length == 2) {
			reversed.push({
				cmd: "L",
				v:e[0]
			})
		}
	})

	path.cmds = reversed



}


SVGImage.prototype.scaleToFit = function(maxWidth, maxHeight, center) {

	
	let w = this.bounds[0].max - this.bounds[0].min
	let h = this.bounds[1].max - this.bounds[1].min
	let cx = (this.bounds[0].max + this.bounds[0].min)/2
	let cy = (this.bounds[1].max + this.bounds[1].min)/2
	let scale = Math.min(maxWidth/w, maxHeight/h)

	// Figure out the offset to center it
	let offset = [0,0]
	if (center){
		offset = [-cx*scale, -cy*scale]
	}

	
	this.paths.forEach(path => {
		path.cmds.forEach(cmd => {
			// For each vector in this command
			for (var i = 0; i < cmd.v.length; i++) {
				cmd.v[i] = cmd.v[i]*scale + offset[i%2]
			}
		})	
	})
}

SVGImage.prototype.toString = function() {
	return this.paths.map(path => {
		return path.cmds.map(cmd => `${cmd.cmd}:(${cmd.v.map(m => m.toFixed(2)).join(",")})`).join("\n")
	}).join("\n_\n")
}


SVGImage.prototype.toShape = function(p) {
}


SVGImage.prototype.draw = function(p, contour) {
	this.paths.forEach(path => {
		

		contour?p.beginContour():p.beginShape()
		path.cmds.forEach((c,index) => {
			switch(c.cmd) {
				case "C":
					p.bezierVertex(...c.v)
					break
				case "L":
					p.vertex(...c.v)
					break


				default: 
					console.log("Unknown!", c.cmd)

			}
		})
		contour?p.endContour():p.endShape()
		
	})
	
	
}

